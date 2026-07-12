fn main() {
    for variable in [
        "NYAMARKDOWNOR_VERSION",
        "NYAMARKDOWNOR_COMMIT",
        "NYAMARKDOWNOR_BUILD_DATE",
        "NYAMARKDOWNOR_UPDATE_REPOSITORY",
    ] {
        println!("cargo:rerun-if-env-changed={variable}");
    }

    tauri_build::build()
}
