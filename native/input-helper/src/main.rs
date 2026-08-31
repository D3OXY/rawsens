use std::sync::OnceLock;
use std::time::Instant;

static PROCESS_STARTED: OnceLock<Instant> = OnceLock::new();

fn timestamp_us() -> u64 {
    PROCESS_STARTED
        .get_or_init(Instant::now)
        .elapsed()
        .as_micros()
        .try_into()
        .unwrap_or(u64::MAX)
}

fn main() {
    PROCESS_STARTED.get_or_init(Instant::now);
    platform::run();
}

#[cfg(target_os = "macos")]
mod platform {
    use super::timestamp_us;
    use std::ffi::c_void;
    use std::io::{self, BufRead, Write};
    use std::ptr;
    use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
    use std::sync::{Arc, mpsc};
    use std::thread;

    type CGEventRef = *mut c_void;
    type CGEventTapProxy = *mut c_void;
    type CFMachPortRef = *mut c_void;
    type CFRunLoopSourceRef = *mut c_void;
    type CFRunLoopRef = *mut c_void;
    type CFStringRef = *const c_void;
    type CGEventTapCallback =
        unsafe extern "C" fn(CGEventTapProxy, u32, CGEventRef, *mut c_void) -> CGEventRef;

    const EVENT_LEFT_DOWN: u32 = 1;
    const EVENT_LEFT_UP: u32 = 2;
    const EVENT_RIGHT_DOWN: u32 = 3;
    const EVENT_RIGHT_UP: u32 = 4;
    const EVENT_MOVED: u32 = 5;
    const EVENT_LEFT_DRAGGED: u32 = 6;
    const EVENT_RIGHT_DRAGGED: u32 = 7;
    const EVENT_OTHER_DOWN: u32 = 25;
    const EVENT_OTHER_UP: u32 = 26;
    const EVENT_OTHER_DRAGGED: u32 = 27;
    const EVENT_TAP_DISABLED_TIMEOUT: u32 = u32::MAX - 1;
    const EVENT_TAP_DISABLED_USER_INPUT: u32 = u32::MAX;
    const FIELD_BUTTON_NUMBER: u32 = 3;
    const FIELD_DELTA_X: u32 = 4;
    const FIELD_DELTA_Y: u32 = 5;

    #[link(name = "ApplicationServices", kind = "framework")]
    unsafe extern "C" {
        fn CGPreflightListenEventAccess() -> bool;
        fn CGRequestListenEventAccess() -> bool;
        fn CGEventTapCreate(
            tap: u32,
            place: u32,
            options: u32,
            events_of_interest: u64,
            callback: CGEventTapCallback,
            user_info: *mut c_void,
        ) -> CFMachPortRef;
        fn CGEventTapEnable(tap: CFMachPortRef, enable: bool);
        fn CGEventGetIntegerValueField(event: CGEventRef, field: u32) -> i64;
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" {
        static kCFRunLoopCommonModes: CFStringRef;
        fn CFMachPortCreateRunLoopSource(
            allocator: *const c_void,
            port: CFMachPortRef,
            order: isize,
        ) -> CFRunLoopSourceRef;
        fn CFRunLoopGetCurrent() -> CFRunLoopRef;
        fn CFRunLoopAddSource(
            run_loop: CFRunLoopRef,
            source: CFRunLoopSourceRef,
            mode: CFStringRef,
        );
        fn CFRunLoopRun();
    }

    struct Context {
        active: AtomicBool,
        capture_id: AtomicU64,
        output: mpsc::Sender<String>,
        tap_address: AtomicU64,
    }

    impl Context {
        fn send(&self, message: String) {
            let _ = self.output.send(message);
        }
    }

    pub fn run() {
        let (output, messages) = mpsc::channel::<String>();
        thread::spawn(move || {
            let stdout = io::stdout();
            let mut writer = stdout.lock();
            for message in messages {
                let _ = writeln!(writer, "{message}");
                let _ = writer.flush();
            }
        });

        let permitted = unsafe { CGPreflightListenEventAccess() };
        let context = Arc::new(Context {
            active: AtomicBool::new(false),
            capture_id: AtomicU64::new(0),
            output,
            tap_address: AtomicU64::new(0),
        });

        read_commands(Arc::clone(&context), permitted);

        if !permitted {
            context.send(capability(
                "permission-required",
                "Input Monitoring permission is required for native relative input.",
            ));
            loop {
                thread::park();
            }
        }

        let mask = [
            EVENT_LEFT_DOWN,
            EVENT_LEFT_UP,
            EVENT_RIGHT_DOWN,
            EVENT_RIGHT_UP,
            EVENT_MOVED,
            EVENT_LEFT_DRAGGED,
            EVENT_RIGHT_DRAGGED,
            EVENT_OTHER_DOWN,
            EVENT_OTHER_UP,
            EVENT_OTHER_DRAGGED,
        ]
        .into_iter()
        .fold(0_u64, |value, event| value | (1_u64 << event));

        let tap = unsafe {
            CGEventTapCreate(
                0,
                0,
                1,
                mask,
                event_callback,
                Arc::as_ptr(&context).cast_mut().cast(),
            )
        };
        if tap.is_null() {
            context.send(capability(
                "permission-required",
                "macOS denied the listen-only event tap.",
            ));
            loop {
                thread::park();
            }
        }

        context.tap_address.store(tap as u64, Ordering::Release);
        context.send(capability(
            "available",
            "Native relative input is available.",
        ));

        let source = unsafe { CFMachPortCreateRunLoopSource(ptr::null(), tap, 0) };
        if source.is_null() {
            context.send(capability(
                "error",
                "Could not attach the native input event tap.",
            ));
            return;
        }
        unsafe {
            CFRunLoopAddSource(CFRunLoopGetCurrent(), source, kCFRunLoopCommonModes);
            CGEventTapEnable(tap, true);
            CFRunLoopRun();
        }
    }

    fn read_commands(context: Arc<Context>, permitted: bool) {
        thread::spawn(move || {
            for command in io::stdin().lock().lines().map_while(Result::ok) {
                match command.trim() {
                    "start" if permitted => {
                        let capture_id = context.capture_id.fetch_add(1, Ordering::AcqRel) + 1;
                        context.active.store(true, Ordering::Release);
                        context.send(capture("started", capture_id, "native-relative", ""));
                    }
                    "start" => {
                        context.send(capture(
                            "lost",
                            context.capture_id.load(Ordering::Acquire),
                            "compatibility-relative",
                            "permission-required",
                        ));
                    }
                    "stop" => {
                        context.active.store(false, Ordering::Release);
                        context.send(capture(
                            "stopped",
                            context.capture_id.load(Ordering::Acquire),
                            "native-relative",
                            "",
                        ));
                    }
                    "request-permission" => {
                        let granted = unsafe { CGRequestListenEventAccess() };
                        context.send(capability(
                            if granted {
                                "available"
                            } else {
                                "permission-required"
                            },
                            if granted {
                                "Input Monitoring permission granted; restarting capture."
                            } else {
                                "Allow RawSens under Privacy & Security → Input Monitoring."
                            },
                        ));
                    }
                    "quit" => std::process::exit(0),
                    _ => {}
                }
            }
            std::process::exit(0);
        });
    }

    unsafe extern "C" fn event_callback(
        _proxy: CGEventTapProxy,
        event_type: u32,
        event: CGEventRef,
        user_info: *mut c_void,
    ) -> CGEventRef {
        let context = unsafe { &*user_info.cast::<Context>() };
        if event_type == EVENT_TAP_DISABLED_TIMEOUT || event_type == EVENT_TAP_DISABLED_USER_INPUT {
            context.active.store(false, Ordering::Release);
            context.send(capture(
                "lost",
                context.capture_id.load(Ordering::Acquire),
                "native-relative",
                "event-tap-disabled",
            ));
            let tap = context.tap_address.load(Ordering::Acquire) as CFMachPortRef;
            if !tap.is_null() {
                unsafe { CGEventTapEnable(tap, true) };
            }
            return event;
        }
        if !context.active.load(Ordering::Acquire) {
            return event;
        }

        let capture_id = context.capture_id.load(Ordering::Acquire);
        match event_type {
            EVENT_MOVED | EVENT_LEFT_DRAGGED | EVENT_RIGHT_DRAGGED | EVENT_OTHER_DRAGGED => {
                let delta_x = unsafe { CGEventGetIntegerValueField(event, FIELD_DELTA_X) };
                let delta_y = unsafe { CGEventGetIntegerValueField(event, FIELD_DELTA_Y) };
                if delta_x != 0 || delta_y != 0 {
                    context.send(format!(
						"{{\"type\":\"move\",\"captureId\":{capture_id},\"timestampUs\":{},\"deltaX\":{delta_x},\"deltaY\":{delta_y}}}",
						timestamp_us(),
					));
                }
            }
            EVENT_LEFT_DOWN | EVENT_LEFT_UP => {
                context.send(button(capture_id, "primary", event_type == EVENT_LEFT_DOWN))
            }
            EVENT_RIGHT_DOWN | EVENT_RIGHT_UP => context.send(button(
                capture_id,
                "secondary",
                event_type == EVENT_RIGHT_DOWN,
            )),
            EVENT_OTHER_DOWN | EVENT_OTHER_UP => {
                let number = unsafe { CGEventGetIntegerValueField(event, FIELD_BUTTON_NUMBER) };
                let name = if number == 2 { "middle" } else { "other" };
                context.send(button(capture_id, name, event_type == EVENT_OTHER_DOWN));
            }
            _ => {}
        }
        event
    }

    fn button(capture_id: u64, button: &str, pressed: bool) -> String {
        format!(
            "{{\"type\":\"button\",\"captureId\":{capture_id},\"timestampUs\":{},\"button\":\"{button}\",\"pressed\":{pressed}}}",
            timestamp_us(),
        )
    }

    fn capability(status: &str, detail: &str) -> String {
        format!(
            "{{\"type\":\"capability\",\"platform\":\"macos\",\"nativeMode\":\"native-relative\",\"status\":\"{status}\",\"detail\":\"{detail}\"}}"
        )
    }

    fn capture(state: &str, capture_id: u64, mode: &str, reason: &str) -> String {
        format!(
            "{{\"type\":\"capture\",\"state\":\"{state}\",\"captureId\":{capture_id},\"timestampUs\":{},\"mode\":\"{mode}\",\"reason\":\"{reason}\"}}",
            timestamp_us(),
        )
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use super::timestamp_us;
    use std::ffi::c_void;
    use std::io::{self, BufRead, Write};
    use std::mem::{self, MaybeUninit};
    use std::ptr;
    use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
    use std::sync::{OnceLock, mpsc};
    use std::thread;

    type Handle = *mut c_void;
    type Hwnd = Handle;
    type Hinstance = Handle;
    type Hrawinput = Handle;
    type Wparam = usize;
    type Lparam = isize;
    type Lresult = isize;

    const WM_INPUT: u32 = 0x00ff;
    const WM_APP_START: u32 = 0x8001;
    const WM_APP_STOP: u32 = 0x8002;
    const WM_APP_QUIT: u32 = 0x8003;
    const RID_INPUT: u32 = 0x10000003;
    const RIDEV_INPUTSINK: u32 = 0x00000100;
    const RIM_TYPEMOUSE: u32 = 0;
    const MOUSE_MOVE_ABSOLUTE: u16 = 0x0001;
    const LEFT_DOWN: u16 = 0x0001;
    const LEFT_UP: u16 = 0x0002;
    const RIGHT_DOWN: u16 = 0x0004;
    const RIGHT_UP: u16 = 0x0008;
    const MIDDLE_DOWN: u16 = 0x0010;
    const MIDDLE_UP: u16 = 0x0020;
    const BUTTON_4_DOWN: u16 = 0x0040;
    const BUTTON_4_UP: u16 = 0x0080;
    const BUTTON_5_DOWN: u16 = 0x0100;
    const BUTTON_5_UP: u16 = 0x0200;

    static ACTIVE: AtomicBool = AtomicBool::new(false);
    static CAPTURE_ID: AtomicU64 = AtomicU64::new(0);
    static OUTPUT: OnceLock<mpsc::Sender<String>> = OnceLock::new();

    #[repr(C)]
    struct WndClassW {
        style: u32,
        window_proc: Option<unsafe extern "system" fn(Hwnd, u32, Wparam, Lparam) -> Lresult>,
        class_extra: i32,
        window_extra: i32,
        instance: Hinstance,
        icon: Handle,
        cursor: Handle,
        background: Handle,
        menu_name: *const u16,
        class_name: *const u16,
    }

    #[repr(C)]
    struct RawInputDevice {
        usage_page: u16,
        usage: u16,
        flags: u32,
        target: Hwnd,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct RawInputHeader {
        input_type: u32,
        size: u32,
        device: Handle,
        wparam: Wparam,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct RawMouse {
        flags: u16,
        buttons: u32,
        raw_buttons: u32,
        last_x: i32,
        last_y: i32,
        extra_information: u32,
    }

    #[repr(C)]
    struct Point {
        x: i32,
        y: i32,
    }

    #[repr(C)]
    struct Msg {
        hwnd: Hwnd,
        message: u32,
        wparam: Wparam,
        lparam: Lparam,
        time: u32,
        point: Point,
        private: u32,
    }

    #[link(name = "user32")]
    unsafe extern "system" {
        fn RegisterClassW(class: *const WndClassW) -> u16;
        fn CreateWindowExW(
            ex_style: u32,
            class_name: *const u16,
            window_name: *const u16,
            style: u32,
            x: i32,
            y: i32,
            width: i32,
            height: i32,
            parent: Hwnd,
            menu: Handle,
            instance: Hinstance,
            param: *mut c_void,
        ) -> Hwnd;
        fn DefWindowProcW(hwnd: Hwnd, message: u32, wparam: Wparam, lparam: Lparam) -> Lresult;
        fn RegisterRawInputDevices(devices: *const RawInputDevice, count: u32, size: u32) -> i32;
        fn GetRawInputData(
            input: Hrawinput,
            command: u32,
            data: *mut c_void,
            size: *mut u32,
            header_size: u32,
        ) -> u32;
        fn GetMessageW(message: *mut Msg, hwnd: Hwnd, min: u32, max: u32) -> i32;
        fn TranslateMessage(message: *const Msg) -> i32;
        fn DispatchMessageW(message: *const Msg) -> Lresult;
        fn PostThreadMessageW(thread_id: u32, message: u32, wparam: Wparam, lparam: Lparam) -> i32;
    }

    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn GetModuleHandleW(module_name: *const u16) -> Hinstance;
        fn GetCurrentThreadId() -> u32;
    }

    pub fn run() {
        let (output, messages) = mpsc::channel::<String>();
        let _ = OUTPUT.set(output);
        thread::spawn(move || {
            let stdout = io::stdout();
            let mut writer = stdout.lock();
            for message in messages {
                let _ = writeln!(writer, "{message}");
                let _ = writer.flush();
            }
        });

        let instance = unsafe { GetModuleHandleW(ptr::null()) };
        let class_name: Vec<u16> = "RawSensInputHelper\0".encode_utf16().collect();
        let class = WndClassW {
            style: 0,
            window_proc: Some(window_proc),
            class_extra: 0,
            window_extra: 0,
            instance,
            icon: ptr::null_mut(),
            cursor: ptr::null_mut(),
            background: ptr::null_mut(),
            menu_name: ptr::null(),
            class_name: class_name.as_ptr(),
        };
        if unsafe { RegisterClassW(&class) } == 0 {
            send(capability(
                "error",
                "Could not register the Raw Input window.",
            ));
            return;
        }

        let message_only_parent = -3_isize as Hwnd;
        let hwnd = unsafe {
            CreateWindowExW(
                0,
                class_name.as_ptr(),
                class_name.as_ptr(),
                0,
                0,
                0,
                0,
                0,
                message_only_parent,
                ptr::null_mut(),
                instance,
                ptr::null_mut(),
            )
        };
        if hwnd.is_null() {
            send(capability(
                "error",
                "Could not create the Raw Input window.",
            ));
            return;
        }

        let device = RawInputDevice {
            usage_page: 0x01,
            usage: 0x02,
            flags: RIDEV_INPUTSINK,
            target: hwnd,
        };
        if unsafe { RegisterRawInputDevices(&device, 1, mem::size_of::<RawInputDevice>() as u32) }
            == 0
        {
            send(capability(
                "error",
                "Windows rejected Raw Input registration.",
            ));
            return;
        }
        send(capability(
            "available",
            "Windows hardware Raw Input is available.",
        ));

        let thread_id = unsafe { GetCurrentThreadId() };
        read_commands(thread_id);
        let mut message = MaybeUninit::<Msg>::zeroed();
        loop {
            let result = unsafe { GetMessageW(message.as_mut_ptr(), ptr::null_mut(), 0, 0) };
            if result <= 0 {
                break;
            }
            let message = unsafe { message.assume_init_ref() };
            match message.message {
                WM_APP_START => {
                    let capture_id = CAPTURE_ID.fetch_add(1, Ordering::AcqRel) + 1;
                    ACTIVE.store(true, Ordering::Release);
                    send(capture("started", capture_id, ""));
                }
                WM_APP_STOP => {
                    ACTIVE.store(false, Ordering::Release);
                    send(capture("stopped", CAPTURE_ID.load(Ordering::Acquire), ""));
                }
                WM_APP_QUIT => break,
                _ => unsafe {
                    TranslateMessage(message);
                    DispatchMessageW(message);
                },
            }
        }
    }

    fn read_commands(thread_id: u32) {
        thread::spawn(move || {
            for command in io::stdin().lock().lines().map_while(Result::ok) {
                let message = match command.trim() {
                    "start" => WM_APP_START,
                    "stop" => WM_APP_STOP,
                    "quit" => WM_APP_QUIT,
                    _ => continue,
                };
                unsafe {
                    PostThreadMessageW(thread_id, message, 0, 0);
                }
            }
            unsafe {
                PostThreadMessageW(thread_id, WM_APP_QUIT, 0, 0);
            }
        });
    }

    unsafe extern "system" fn window_proc(
        hwnd: Hwnd,
        message: u32,
        wparam: Wparam,
        lparam: Lparam,
    ) -> Lresult {
        if message == WM_INPUT && ACTIVE.load(Ordering::Acquire) {
            read_raw_input(lparam as Hrawinput);
        }
        unsafe { DefWindowProcW(hwnd, message, wparam, lparam) }
    }

    fn read_raw_input(input: Hrawinput) {
        let header_size = mem::size_of::<RawInputHeader>() as u32;
        let mut size = 0_u32;
        unsafe {
            GetRawInputData(input, RID_INPUT, ptr::null_mut(), &mut size, header_size);
        }
        if size < header_size + mem::size_of::<RawMouse>() as u32 {
            return;
        }
        let mut bytes = vec![0_u8; size as usize];
        let copied = unsafe {
            GetRawInputData(
                input,
                RID_INPUT,
                bytes.as_mut_ptr().cast(),
                &mut size,
                header_size,
            )
        };
        if copied != size {
            return;
        }

        let header = unsafe { ptr::read_unaligned(bytes.as_ptr().cast::<RawInputHeader>()) };
        if header.input_type != RIM_TYPEMOUSE {
            return;
        }
        let mouse = unsafe {
            ptr::read_unaligned(
                bytes
                    .as_ptr()
                    .add(mem::size_of::<RawInputHeader>())
                    .cast::<RawMouse>(),
            )
        };
        if mouse.flags & MOUSE_MOVE_ABSOLUTE != 0 {
            return;
        }

        let capture_id = CAPTURE_ID.load(Ordering::Acquire);
        if mouse.last_x != 0 || mouse.last_y != 0 {
            send(format!(
                "{{\"type\":\"move\",\"captureId\":{capture_id},\"timestampUs\":{},\"deltaX\":{},\"deltaY\":{}}}",
                timestamp_us(),
                mouse.last_x,
                mouse.last_y,
            ));
        }
        let flags = mouse.buttons as u16;
        for (mask, button_name, pressed) in [
            (LEFT_DOWN, "primary", true),
            (LEFT_UP, "primary", false),
            (RIGHT_DOWN, "secondary", true),
            (RIGHT_UP, "secondary", false),
            (MIDDLE_DOWN, "middle", true),
            (MIDDLE_UP, "middle", false),
            (BUTTON_4_DOWN, "back", true),
            (BUTTON_4_UP, "back", false),
            (BUTTON_5_DOWN, "forward", true),
            (BUTTON_5_UP, "forward", false),
        ] {
            if flags & mask != 0 {
                send(button(capture_id, button_name, pressed));
            }
        }
    }

    fn send(message: String) {
        if let Some(output) = OUTPUT.get() {
            let _ = output.send(message);
        }
    }

    fn button(capture_id: u64, button: &str, pressed: bool) -> String {
        format!(
            "{{\"type\":\"button\",\"captureId\":{capture_id},\"timestampUs\":{},\"button\":\"{button}\",\"pressed\":{pressed}}}",
            timestamp_us(),
        )
    }

    fn capability(status: &str, detail: &str) -> String {
        format!(
            "{{\"type\":\"capability\",\"platform\":\"windows\",\"nativeMode\":\"hardware-raw\",\"status\":\"{status}\",\"detail\":\"{detail}\"}}"
        )
    }

    fn capture(state: &str, capture_id: u64, reason: &str) -> String {
        format!(
            "{{\"type\":\"capture\",\"state\":\"{state}\",\"captureId\":{capture_id},\"timestampUs\":{},\"mode\":\"hardware-raw\",\"reason\":\"{reason}\"}}",
            timestamp_us(),
        )
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod platform {
    use std::io::{self, BufRead};

    pub fn run() {
        println!(
            "{{\"type\":\"capability\",\"platform\":\"unsupported\",\"nativeMode\":null,\"status\":\"unsupported\",\"detail\":\"Native input is supported on Windows and macOS.\"}}"
        );
        for command in io::stdin().lock().lines().map_while(Result::ok) {
            if command.trim() == "quit" {
                break;
            }
        }
    }
}
