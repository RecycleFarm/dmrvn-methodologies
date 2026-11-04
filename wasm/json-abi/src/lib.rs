pub use serde_json;

#[macro_export]
macro_rules! export_json_wasm_v2 {
    ($compute_methodology:path) => {
        static RESULT_LEN: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

        #[no_mangle]
        pub extern "C" fn alloc(length: i32) -> i32 {
            let Ok(length) = usize::try_from(length) else { return 0 };
            if length == 0 || length > 512 * 1024 { return 0 }
            let Ok(layout) = std::alloc::Layout::array::<u8>(length) else { return 0 };
            unsafe { std::alloc::alloc(layout) as i32 }
        }

        #[no_mangle]
        pub extern "C" fn dealloc(pointer: i32, length: i32) {
            let (Ok(pointer), Ok(length)) = (usize::try_from(pointer), usize::try_from(length)) else { return };
            if pointer == 0 || length == 0 || length > 512 * 1024 { return }
            if let Ok(layout) = std::alloc::Layout::array::<u8>(length) {
                unsafe { std::alloc::dealloc(pointer as *mut u8, layout) }
            }
        }

        #[no_mangle]
        pub extern "C" fn result_len() -> i32 {
            RESULT_LEN.load(std::sync::atomic::Ordering::Relaxed) as i32
        }

        #[no_mangle]
        pub extern "C" fn compute(input_pointer: i32, input_length: i32) -> i32 {
            RESULT_LEN.store(0, std::sync::atomic::Ordering::Relaxed);
            let (Ok(pointer), Ok(length)) = (usize::try_from(input_pointer), usize::try_from(input_length)) else { return 0 };
            if pointer == 0 || length == 0 || length > 512 * 1024 { return 0 }
            let input = unsafe { std::slice::from_raw_parts(pointer as *const u8, length) };
            let Ok(value) = $crate::serde_json::from_slice::<$crate::serde_json::Value>(input) else { return 0 };
            let Ok(output) = $compute_methodology(&value) else { return 0 };
            if !output.is_object() { return 0 }
            let Ok(bytes) = $crate::serde_json::to_vec(&output) else { return 0 };
            if bytes.is_empty() || bytes.len() > 512 * 1024 { return 0 }
            let Ok(layout) = std::alloc::Layout::array::<u8>(bytes.len()) else { return 0 };
            let output_pointer = unsafe { std::alloc::alloc(layout) };
            if output_pointer.is_null() { return 0 }
            unsafe { std::ptr::copy_nonoverlapping(bytes.as_ptr(), output_pointer, bytes.len()) }
            RESULT_LEN.store(bytes.len(), std::sync::atomic::Ordering::Relaxed);
            output_pointer as i32
        }
    };
}
