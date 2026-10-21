# Yantra Execution Flow & Boot Sequence

Understanding how the **Yantra** emulator transitions from binary command-line arguments to booting OpenSBI, mounting an ext4 root filesystem in Linux 6.8, and serving an interactive BusyBox shell.

![Yantra System Execution & Linux Boot Flow](assets/images/yantra-execution-flow.png)

---

## Six-Stage Execution Lifecycle

The execution lifecycle of Yantra is structured into six discrete, deterministic phases:

### 1. CLI Argument Parsing
The emulator parses command-line arguments to locate target images, or falls back to bundled defaults:
- `--bios <path>`: OpenSBI firmware binary (`payloads/fw_jump.bin`).
- `--kernel <path>`: Uncompressed Linux kernel image (`payloads/Image`).
- `--dtb <path>`: Device Tree Blob (`payloads/virt.dtb`).
- `--disk <path>`: VirtIO ext4 filesystem disk image (`payloads/busybear.bin`).

```powershell
$ yantra \
  --bios fw_jump.bin \
  --kernel Image \
  --dtb virt.dtb \
  --disk rootfs.img
```

### 2. Hardware & Memory Allocation
- Allocates **512 MB contiguous DRAM** mapped from `0x80000000` to `0x9FFFFFFF`.
- Maps MMIO regions for memory-mapped peripherals:
  - UART 16550A: `0x10000000`
  - SiFive CLINT: `0x02000000`
  - SiFive PLIC: `0x0C000000`
  - VirtIO Block: `0x10001000`

### 3. Firmware & Kernel Payload Loading
The loader copies system binaries directly into simulated DRAM memory:
- `fw_jump.bin` (OpenSBI): Placed at DRAM base `0x80000000`.
- `Image` (Linux Kernel): Loaded at standard kernel base `0x80200000`.
- `virt.dtb` (Device Tree): Placed in upper DRAM memory, with its address placed in register `a1`.

### 4. CPU Initialization & Reset State
The hardware reset vector sets the initial architectural state:
- **PC**: Set to OpenSBI entry point (`0x80000000`).
- **Privilege Mode**: Set to **Machine Mode (M-Mode)**.
- **x0 - x31**: Initialized to `0x0000000000000000`.
- **f0 - f31**: Initialized to `0x0000000000000000`.
- **CSRs**: Initialized to reset defaults (`mstatus`, `misa`, `medeleg`, `mideleg`, `mtvec`).
- **Registers `a0` and `a1`**: `a0 = 0` (Hart ID), `a1 = dtb_addr` (Device Tree address in DRAM).

### 5. Fetch-Decode-Execute CPU Loop
The core execution engine executes instructions continuously in a deterministic loop:
1. **Fetch**: Fetches 16-bit or 32-bit instruction words from memory via the Sv39 MMU and TLB.
2. **Decode**: Decodes opcode, registers (`rd`, `rs1`, `rs2`), immediate fields, and instruction format.
3. **Execute**: Dispatches to integer ALU, FPU unit, Atomic memory operations, or CSR read/write logic.
4. **Check Interrupts**: Inspects timer interrupts (CLINT `mtime` >= `mtimecmp`) and external device interrupts (PLIC pending bits).
5. **Handle Traps / Advance PC**: Traps invoke hardware vector routines; normal instructions increment PC by 2 (compressed) or 4 bytes.

### 6. Operating System Handover & Shell
- **OpenSBI Execution**: OpenSBI executes in M-mode, initializes hardware timers and UART, configures PMP (Physical Memory Protection), and delegates exceptions.
- **S-Mode Handover**: OpenSBI executes `mret` with `mstatus.MPP` set to Supervisor mode, transferring execution to Linux at `0x80200000`.
- **Linux Kernel Boot**: Linux initializes paging (Sv39), discovers devices through the Device Tree, mounts the VirtIO block device `/dev/vda` as ext4 root, and executes `/sbin/init`.
- **User Prompt**: BusyBox initiates an interactive root shell on the UART console:

```text
welcome to Linux!
(none) login: nvidia
Password: nvidia
nvidia@(none):~#
```
