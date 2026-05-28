#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    aio_troubleshooter_lib::run();
}
