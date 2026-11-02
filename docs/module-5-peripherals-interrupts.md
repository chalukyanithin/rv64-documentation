# Module 5: System Peripherals & Interrupt Controllers (UART, CLINT, PLIC, VirtIO)

---

## Step 1: Learning Objectives & Prerequisites

> [!NOTE]
> **🎯 Learning Objectives**
>
> By the end of this module, you will be able to:
> 1. **Explain Memory-Mapped I/O (MMIO)**: Explain MMIO address bus decoding and how memory operations dispatch to simulated hardware peripheral registers instead of physical DRAM.
> 2. **Master CLINT Timer Hardware**: Master the SiFive CLINT (Core Local Interruptor) timer hardware mechanics (`mtime`, `mtimecmp`) and Machine Software/Timer interrupt generation (`MSIP`, `MTIP`).
> 3. **Deconstruct PLIC Arbitration**: Deconstruct the SiFive PLIC (Platform-Level Interrupt Controller) arbitration workflow: Priority evaluation, Pending bits, Threshold filtering, and the Claim/Complete cycle.
> 4. **Understand UART 16550A Emulation**: Understand UART 16550A emulation: Non-blocking terminal console I/O, Transmit/Receive FIFOs, and character interrupt generation.
> 5. **Trace VirtIO DMA Transfers**: Trace VirtIO-MMIO Block Device Direct Memory Access (DMA) transfers across descriptor rings (`virtqueue`), available rings, and used rings to read disk images (`busybear.bin`).

**Prerequisites**: Module 2 (Memory bus routing & physical addresses), Module 3 (Privilege modes & `mcause`/`scause` trap entry), and Module 4 (Atomic memory operations & concurrency).

---

## Step 2: Conceptual Foundation (First Principles)

## 1. The Core Hardware Problem

A CPU core alone cannot interact with the physical world. It needs ways to receive keystrokes from a terminal, keep track of real time for OS process scheduling, acknowledge external hardware signals, and read gigabytes of data from persistent storage.

In RISC-V systems, peripherals do not use dedicated port instructions (like x86 `in`/`out`). Instead, they rely on **Memory-Mapped I/O (MMIO)**. Specific regions of the 64-bit physical address space are assigned to device registers. When the CPU executes a standard `sd` (store doubleword) or `ld` (load doubleword) targeting an MMIO address, the bus routes the access to the device logic rather than physical DRAM.

---

## 2. Deep Dive into Simulated Peripherals

### A. SiFive CLINT (Core Local Interruptor) — Address `0x02000000`

Generates core-local timer and software interrupts:

- **`mtime`** (64-bit, offset `0xBFF8`): Real-time counter continuously incremented by a constant frequency tick.
- **`mtimecmp`** (64-bit, offset `0x4000`): Timer comparison register set by OS firmware/kernel.
- **Interrupt Condition**: Whenever `mtime >= mtimecmp`, the CLINT asserts the **MTIP** (Machine Timer Interrupt Pending) bit in `mip`/`sip`. Setting `mtimecmp` to `0xFFFFFFFFFFFFFFFF` clears the pending timer interrupt.

---

### B. SiFive PLIC (Platform-Level Interrupt Controller) — Address `0x0C000000`

Routes external hardware interrupts (UART, VirtIO) to the CPU core:

1. **Interrupt Sources**: Assigns IDs to hardware devices (e.g., UART = Source 1, VirtIO = Source 8).
2. **Priority Registers**: Each source has a configurable priority (1–7).
3. **Threshold Register**: Sets the minimum priority level required to trigger an interrupt.
4. **Claim/Complete Workflow**:
   - **Claim**: The OS reads the Claim register (`0x0C200004`). The PLIC returns the ID of the highest-priority pending interrupt and atomically clears the pending bit.
   - **Complete**: After servicing the device, the OS writes the serviced source ID back to the Claim/Complete register to signal readiness for subsequent interrupts.

---

### C. UART 16550A Console — Address `0x10000000`

Handles interactive ASCII text input and output:

- **`RBR` / `THR`** (Offset `0`): Receive Buffer Register (read) / Transmit Holding Register (write). Writing a character to `THR` prints it to `stdout`. Reading `RBR` retrieves input from `stdin`.
- **`LSR`** (Line Status Register, Offset `5`):
  - Bit 5 (`THRE`): Indicates transmit holding register empty (ready to send).
  - Bit 0 (`DR`): Indicates data ready to be read.

---

### D. VirtIO-MMIO Block Device — Address `0x10001000`

Provides high-speed virtual disk I/O (`/dev/vda` using `busybear.bin`). Uses shared-memory **Virtqueues** containing three structures:

1. **Descriptor Table**: Array of buffer descriptors specifying physical DRAM address, length, and read/write flags (`NEXT`, `WRITE`).
2. **Available Ring**: Array filled by the OS driver indicating which descriptors are ready for the device to process.
3. **Used Ring**: Array filled by the emulator indicating which completed descriptor requests have been processed.

---

## Step 3: Source-Code Investigation (Yantra Implementation)

In **Yantra**, physical memory access requests are routed through a central system bus dispatcher:

```cpp
class Bus {
private:
    Clint       clint;
    Plic        plic;
    Uart        uart;
    VirtioBlock virtio;
    Dram        dram;

public:
    uint64_t read64(uint64_t addr) {
        if (addr >= 0x80000000 && addr < 0xA0000000) {
            return dram.read64(addr - 0x80000000);
        } else if (addr >= 0x02000000 && addr < 0x02010000) {
            return clint.read(addr - 0x02000000);
        } else if (addr >= 0x0C000000 && addr < 0x10000000) {
            return plic.read(addr - 0x0C000000);
        } else if (addr >= 0x10000000 && addr < 0x10000008) {
            return uart.read(addr - 0x10000000);
        } else if (addr >= 0x10001000 && addr < 0x10002000) {
            return virtio.read(addr - 0x10001000);
        }
        raise_access_fault(addr); // Out-of-bounds MMIO read
        return 0;
    }

    void write64(uint64_t addr, uint64_t val) {
        if (addr >= 0x80000000 && addr < 0xA0000000) {
            dram.write64(addr - 0x80000000, val);
        } else if (addr >= 0x02000000 && addr < 0x02010000) {
            clint.write(addr - 0x02000000, val);
        }
        // ... Dispatch to PLIC, UART, VirtIO
    }
};
```

---

## Step 4: Concrete Walkthrough (VirtIO Disk Read Transfer)

Let's trace a Linux kernel disk block read from `/dev/vda` (`busybear.bin`):

### 1. DRIVER SETUP (Guest OS / Linux)

Linux allocates 3 Descriptors in DRAM Descriptor Table:
- **Desc 0**: Header (Sector number = 100, Type = `VIRTIO_BLK_T_IN` [Read])
- **Desc 1**: Data Buffer (DRAM PA = `0x81000000`, Length = 512 bytes, Flag = `WRITE`)
- **Desc 2**: Status Byte (DRAM PA = `0x81000200`, Length = 1 byte, Flag = `WRITE`)

Linux writes Desc index (`0`) into the Available Ring, then writes the Queue Index to VirtIO MMIO `QueueNotify` register (`0x10001050`).

### 2. EMULATOR PROCESSING (Yantra VirtIO Device)

- MMIO write to `QueueNotify` triggers `VirtioBlock::process_queue()`.
- Reads **Desc 0**: Extracts requested disk sector (100).
- Reads **Desc 1**: Reads 512 bytes from `busybear.bin` image file at offset `(100 * 512)`.
- Performs Direct Memory Access (DMA):
  ```cpp
  bus.write_bytes(0x81000000, buffer, 512);
  ```
- Reads **Desc 2**: Writes `0` (`VIRTIO_BLK_S_OK`) to status address `0x81000200`.

### 3. INTERRUPT NOTIFICATION & COMPLETION

1. VirtIO device writes Desc 0 index to the **Used Ring**.
2. Asserts VirtIO interrupt line to PLIC (Interrupt Source 8).
3. PLIC signals **SEIP** (Supervisor External Interrupt Pending) to the CPU core.
4. Linux kernel trap handler executes, claims the interrupt from PLIC, checks the Used Ring, and resumes the blocked process.

---

## Step 5: Edge Cases & Real-World Considerations

### 1. Non-Blocking UART I/O
Terminal input must not block the main CPU execution loop. The UART emulator uses non-blocking multi-threaded FIFO queues or asynchronous C++ `select`/`poll` calls to check for incoming keystrokes without freezing emulator execution.

### 2. MMIO Alignment Requirements
Peripheral hardware registers mandate strict 32-bit (`uint32_t`) or 64-bit (`uint64_t`) aligned accesses. Unaligned byte or halfword reads to CLINT or PLIC registers must trigger an **Instruction/Load Address Misaligned** trap.

### 3. VirtIO Descriptor Chain Validation
Malicious or buggy guest kernels could create circular loops in descriptor chains (e.g., Desc 0 → Desc 1 → Desc 0). The emulator must enforce a maximum chain limit (e.g., 32 descriptors) to prevent infinite loops during DMA processing.

---

## Step 6: System Connectivity

- **Upstream Dependency**: Connects to physical address generation in Module 2 (Sv39 MMU) and interrupt trap delegation in Module 3 (Privilege modes).
- **Downstream Dependency**: Provides the complete hardware simulation required to execute OpenSBI firmware, boot the Linux kernel image (`Image`), process OpenSBI/UART logs, and initialize the BusyBox interactive shell prompt.

---

## Step 7: Summary & Review

> [!TIP]
> **📌 Key Takeaways**
>
> 1. **MMIO**: Maps hardware device registers into the CPU's physical memory space; standard `ld`/`sd` instructions perform peripheral configuration and I/O.
> 2. **CLINT**: Manages real-time clock counter `mtime` and comparison register `mtimecmp` for hardware timer interrupts.
> 3. **PLIC**: Arbitrates external interrupts using priority, threshold, and explicit Claim/Complete cycles.
> 4. **UART 16550A**: Provides non-blocking console terminal character input/output.
> 5. **VirtIO-MMIO**: Enables high-performance disk I/O via shared-memory ring structures (Virtqueues) and Direct Memory Access (DMA).

