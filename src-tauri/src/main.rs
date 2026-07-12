#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

fn main() {
    let arguments = std::env::args().skip(1).collect::<Vec<_>>();
    if matches!(arguments.as_slice(), [argument] if matches!(argument.as_str(), "--version" | "-V" | "-version" | "version"))
    {
        println!("{}", nya_markdownor_lib::version_output());
        return;
    }

    nya_markdownor_lib::run()
}
