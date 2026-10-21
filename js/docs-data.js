/**
 * RV64 Technical Documentation Database
 * Warm beige, cream and skin editorial system
 */

window.DOCS_DATABASE = [
  {
    id: "overview",
    title: "Project Overview",
    category: "Getting Started",
    description: "Introduction to the Yantra C++20 RISC-V 64-bit Full System Emulator.",
    content: `# Yantra: RISC-V 64-bit System Emulator

**Yantra** is a high-performance, modular C++20 RISC-V 64-bit (\`RV64GC\`) full-system emulator engineered to boot OpenSBI firmware, execute the Linux 6.8 kernel, and run an interactive Linux userspace shell.

> [!NOTE]
> Designed with zero external dependencies in the CPU core, modern C++20 features (concepts, \`std::span\`, bit manipulation), and an exact cycle-accurate memory model.

---

## Key Highlights

- **RV64GC Base Architecture**: Full 64-bit general purpose integer registers with standard M (Integer Multiplication/Division), A (Atomics), F & D (Single & Double Precision Floating Point), and C (Compressed 16-bit instructions).
- **Sv39 Virtual Memory MMU**: 3-level page table walking mechanism with hardware TLB caching, SATP ASID tagging, and Copy-On-Write (COW) protection.
- **Privilege Levels**: Complete hardware specification for Machine Mode (\`M\`), Supervisor Mode (\`S\`), and User Mode (\`U\`) with delegation registers (\`medeleg\`, \`mideleg\`).
- **Standard Peripherals**:
  - **UART 16550A** (\`0x10000000\`): Full TX/RX FIFO and interrupt identification.
  - **SiFive CLINT** (\`0x02000000\`): Core Local Interruptor for hardware \`mtime\`/\`mtimecmp\` ticks.
  - **SiFive PLIC** (\`0x0c000000\`): Platform-Level Interrupt Controller routing device IRQs.
  - **VirtIO-MMIO Block** (\`0x10001000\`): Direct DMA disk access for ext4 root filesystems.

---

## System Architecture Diagram

\`\`\`
+-------------------------------------------------------------------------+
|                              RV64GC CPU Core                            |
|  +--------------------+   +-------------------+   +------------------+  |
|  | 32 GPRs (x0 - x31) |   | 32 FPRs (f0 - f31)|   | CSR Control Unit |  |
|  +--------------------+   +-------------------+   +------------------+  |
|  |     ALU & Multiplier   |    FPU Unit (F&D) |   | Trap & Exception |  |
+--+--------------------+---+-------------------+---+------------------+--+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                                Sv39 MMU                                 |
|  +--------------------+  +--------------------+  +--------------------+ |
|  |    Direct TLB      |  | 3-Level Page Walk  |  | SATP Address Space | |
|  +--------------------+  +--------------------+  +--------------------+ |
+------------------------------------+------------------------------------+
                                     | System Bus (Crossbar)
   +----------------+----------------+----------------+---------------+
   |                |                |                |               |
   v                v                v                v               v
+------+       +---------+      +---------+      +---------+     +---------+
| DRAM |       |  UART   |      |  CLINT  |      |  PLIC   |     | VirtIO  |
|512 MB|       | 16550A  |      | SiFive  |      | SiFive  |     | Block   |
+------+       +---------+      +---------+      +---------+     +---------+
\`\`\`
`
  },
  {
    id: "build-and-run",
    title: "Building & Running",
    category: "Getting Started",
    description: "Step-by-step compilation guide using CMake and Visual Studio 2022 MSVC on Windows.",
    content: `# Building & Running the Emulator

Yantra is built using **CMake 3.20+** and modern **C++20** compilers. On Windows, Microsoft Visual Studio 2022 (MSVC) is the primary supported toolchain.

---

## Prerequisites

1. **Windows 10 / 11 (64-bit)**
2. **Visual Studio 2022** with the *"Desktop development with C++"* workload installed.
3. **CMake 3.20 or newer** (bundled with VS or installed via winget).
4. **Git for Windows**.

---

## Compilation Steps (MSVC Release Mode)

Open a PowerShell terminal and navigate to the project directory:

\`\`\`powershell
# 1. Generate CMake build files for x64 architecture
cmake -B build-msvc -A x64

# 2. Compile the Release target with multi-threaded optimizations
cmake --build build-msvc --config Release -j
\`\`\`

> [!IMPORTANT]
> Always compile in **Release mode** (\`--config Release\`). Full-system emulation throughput increases by over 12x compared to Debug mode due to inlined instruction decoding and branch prediction hints.

The executable binary will be generated at:
\`\`\`powershell
.\\build-msvc\\Release\\yantra.exe
\`\`\`

---

## Executing the Linux 6.8 Boot

Launch the emulator directly with the default payload bundle:

\`\`\`powershell
.\\build-msvc\\Release\\yantra.exe
\`\`\`

### Custom Payload Flags

You can override individual firmware, kernel, and disk images using CLI arguments:

\`\`\`powershell
.\\build-msvc\\Release\\yantra.exe --bios payloads/fw_jump.bin \`
                                --kernel payloads/Image \`
                                --dtb payloads/virt.dtb \`
                                --disk payloads/busybear.bin
\`\`\`

### CLI Command Options

| Flag | Argument | Description | Default |
| :--- | :--- | :--- | :--- |
| \`--bios\` | \`<path>\` | Path to OpenSBI firmware | \`payloads/fw_jump.bin\` |
| \`--kernel\` | \`<path>\` | Path to raw Linux kernel image | \`payloads/Image\` |
| \`--dtb\` | \`<path>\` | Path to Device Tree Blob | \`payloads/virt.dtb\` |
| \`--disk\` | \`<path>\` | VirtIO block ext4 disk image | \`payloads/busybear.bin\` |
| \`-h, --help\` | \`-\` | Display help and exit | \`-\` |
`
  },
  {
    id: "rv64-register-model",
    title: "RV64 Register Model",
    category: "CPU & Execution",
    description: "Specification and ABI conventions for registers x0-x31, Floating-Point, and PC.",
    content: `# RV64 Register Model

The standard RISC-V 64-bit integer register state consists of 32 general-purpose registers (\`x0\` through \`x31\`), each **64 bits wide** (\`XLEN = 64\`), plus the Program Counter (\`pc\`).

---

## General Purpose Registers (GPRs)

\`x0\` is hardwired to zero. Writes to \`x0\` are discarded with zero side-effects.

| Register | ABI Name | Description | Saver |
| :--- | :--- | :--- | :--- |
| \`x0\` | \`zero\` | Hard-wired Zero | - |
| \`x1\` | \`ra\` | Return Address | Caller |
| \`x2\` | \`sp\` | Stack Pointer | Callee |
| \`x3\` | \`gp\` | Global Pointer | - |
| \`x4\` | \`tp\` | Thread Pointer | - |
| \`x5\`-\`x7\` | \`t0\`-\`t2\` | Temporaries | Caller |
| \`x8\` | \`s0\` / \`fp\` | Saved Register / Frame Pointer | Callee |
| \`x9\` | \`s1\` | Saved Register | Callee |
| \`x10\`-\`x11\`| \`a0\`-\`a1\` | Function Arguments / Return Values | Caller |
| \`x12\`-\`x17\`| \`a2\`-\`a7\` | Function Arguments | Caller |
| \`x18\`-\`x27\`| \`s2\`-\`s11\` | Saved Registers | Callee |
| \`x28\`-\`x31\`| \`t3\`-\`t6\` | Temporaries | Caller |
| \`pc\` | \`pc\` | 64-bit Program Counter | - |

---

## C++20 Register File Implementation

\`\`\`cpp
#include <array>
#include <cstdint>

namespace rv64 {

class RegisterFile {
private:
    std::array<uint64_t, 32> regs_{};
    uint64_t pc_{0x80000000}; // Reset vector pointing to DRAM

public:
    [[nodiscard]] inline uint64_t read(uint8_t index) const noexcept {
        return (index == 0) ? 0ULL : regs_[index];
    }

    inline void write(uint8_t index, uint64_t value) noexcept {
        if (index != 0) [[likely]] {
            regs_[index] = value;
        }
    }

    [[nodiscard]] inline uint64_t pc() const noexcept { return pc_; }
    inline void set_pc(uint64_t new_pc) noexcept { pc_ = new_pc; }
};

} // namespace rv64
\`\`\`

> [!TIP]
> Use the interactive **Register Explorer** on the right to examine any register's calling convention and reset characteristics.
`
  },
  {
    id: "sv39-mmu",
    title: "Sv39 Virtual Memory",
    category: "Memory Management",
    description: "Detailed breakdown of the 3-level page table walk, TLB, and COW implementation.",
    content: `# Sv39 Virtual Memory Architecture

The RV64 architecture employs the **Sv39** MMU scheme, supporting a 39-bit virtual address space mapped onto up to 56 bits of physical address space.

---

## Virtual Address Partitioning (39 bits)

A 39-bit virtual address is split into three 9-bit Virtual Page Numbers (VPN[2], VPN[1], VPN[0]) and a 12-bit physical page offset:

\`\`\`
 38         30 29         21 20         12 11          0
+-------------+-------------+-------------+-------------+
|    VPN[2]   |    VPN[1]   |    VPN[0]   | Page Offset |
+-------------+-------------+-------------+-------------+
    9 bits        9 bits        9 bits        12 bits
\`\`\`

- **Level 2 (VPN[2])**: Points to 1 GB Gigabit Megapages.
- **Level 1 (VPN[1])**: Points to 2 MB Megapages.
- **Level 0 (VPN[0])**: Points to 4 KB Standard Pages.

---

## 3-Level Page Table Walking Algorithm

\`\`\`mermaid
graph TD
    A[Virtual Address] --> B{Check Canonical Bits 63:38}
    B -->|Invalid| C[Raise Page Fault]
    B -->|Valid| D[Read SATP.PPN root base]
    D --> E[Walk Level 2: VPN 2]
    E --> F{PTE Valid?}
    F -->|No| C
    F -->|Yes: Leaf| G[Check Permissions R/W/X]
    F -->|Yes: Non-Leaf| H[Walk Level 1: VPN 1]
    H --> I{PTE Valid?}
    I -->|No| C
    I -->|Yes: Leaf| G
    I -->|Yes: Non-Leaf| J[Walk Level 0: VPN 0]
    J --> K{PTE Valid?}
    K -->|No| C
    K -->|Yes: Leaf| G
    G --> L[Construct Physical Address]
\`\`\`

### Walk Steps in Yantra:
1. Validate canonical sign-extension: bits \`[63:39]\` must match bit 38.
2. Let \`base = satp.ppn << 12\`.
3. For level \`i = 2, 1, 0\`:
   - Compute \`pte_addr = base + vpn[i] * 8\`.
   - Read 64-bit PTE from DRAM.
   - If \`pte.V == 0\` or (\`pte.R == 0\` and \`pte.W == 1\`), trigger **Page Fault Exception**.
   - If \`pte.R == 1\` or \`pte.X == 1\`, leaf entry found.
   - Else, update \`base = pte.ppn << 12\` and continue down.
`
  },
  {
    id: "peripherals",
    title: "Peripherals & Memory Map",
    category: "Devices & Hardware",
    description: "Memory layout and drivers for UART 16550A, SiFive CLINT, PLIC, and VirtIO Block.",
    content: `# Peripherals & Memory Map

The system bus bridges the RV64 core to physical RAM and memory-mapped hardware controllers.

---

## Physical Address Map

| Address Range | Device | Size | Interrupt (IRQ) |
| :--- | :--- | :--- | :--- |
| \`0x00001000\` - \`0x00001FFF\` | Boot ROM | 4 KB | - |
| \`0x02000000\` - \`0x0200FFFF\` | SiFive CLINT | 64 KB | Software / Timer |
| \`0x0C000000\` - \`0x0FFFFFFF\` | SiFive PLIC | 64 MB | External Interrupts |
| \`0x10000000\` - \`0x100000FF\` | UART 16550A | 256 B | PLIC IRQ #10 |
| \`0x10001000\` - \`0x10001FFF\` | VirtIO Block | 4 KB | PLIC IRQ #1 |
| \`0x80000000\` - \`0x9FFFFFFF\` | Main DRAM | 512 MB | - |

---

## 1. UART 16550A
The serial terminal is mapped at \`0x10000000\`. It handles serial console I/O for the Linux kernel and user shells.
- \`RBR/THR\` (\`+0x00\`): Receive Buffer / Transmitter Holding Register.
- \`IER\` (\`+0x01\`): Interrupt Enable Register.
- \`IIR/FCR\` (\`+0x02\`): Interrupt ID / FIFO Control Register.
- \`LCR\` (\`+0x03\`): Line Control Register (8 data bits, 1 stop bit).
- \`LSR\` (\`+0x05\`): Line Status Register (bit 5: \`THRE\` transmitter empty, bit 0: \`DR\` data ready).

---

## 2. VirtIO-MMIO Block Device
The VirtIO block device at \`0x10001000\` exposes an ext4 disk image to the Linux kernel as \`/dev/vda\`.
- Supports asynchronous split virtqueue descriptors (\`VRING\`).
- Performs direct DMA operations into DRAM with zero copying overhead.
`
  },
  {
    id: "linux-boot",
    title: "Linux Boot & Interactive Shell",
    category: "Devices & Hardware",
    description: "End-to-end boot timeline from BootROM reset vector to BusyBox root prompt.",
    content: `# Linux Boot Process

Booting Linux on Yantra follows the standardized RISC-V boot specification involving three cooperative layers:

\`\`\`
 [ Hardware Reset (PC = 0x1000) ]
               |
               v
 [ OpenSBI Firmware (0x80000000, M-Mode) ]
               |
               v
 [ Linux 6.8 Kernel (0x80200000, S-Mode) ]
               |
               v
 [ Userspace init -> /bin/sh (U-Mode) ]
\`\`\`

---

## Login Credentials

When Linux kernel initialization completes and invokes \`/sbin/init\`, you will be greeted with the login prompt:

\`\`\`text
(none) login: nvidia
Password: nvidia
\`\`\`

- **Default User**: \`nvidia\`
- **Default Password**: \`nvidia\`

---

## Post-Boot Verification Commands

Once logged into the root shell (\`nvidia@(none):~#\`), test the system environment:

\`\`\`bash
# 1. Print CPU architecture info
cat /proc/cpuinfo

# 2. Check kernel version
uname -a

# 3. Inspect mounted ext4 disk
df -h /

# 4. Graceful shutdown
poweroff -f
\`\`\`
`
  },
  {
    id: "pdf-workflow",
    title: "PDF Import & Auto-Deploy",
    category: "Documentation Workflow",
    description: "How to upload PDF documents and push automatically to Git and Vercel.",
    content: `# PDF Import & Automatic Vercel Deployment

This documentation system was architected to be **100% frontend**—no database, no backend servers, and **zero environment variables** to configure on Vercel.

---

## Method 1: In-Browser Drag & Drop (Instant)

1. Click the **"Import PDF"** button in the top navigation bar.
2. Drag and drop any specification PDF (e.g. RISC-V ISA manual, hardware datasheet, or lab notes).
3. The built-in client-side engine parses the text and generates clean markdown in real time.
4. Preview the document, choose a title and category, and click **"Add to Website"** or **"Download .md"**.

---

## Method 2: Python Script with Auto-Push

You can drop PDF files into the \`input_pdfs/\` folder or pass the file path directly to the import script:

\`\`\`bash
# Run the PDF ingestion tool
python scripts/import_pdf.py "path/to/specification.pdf"
\`\`\`

The script will:
1. Extract text, headings, and code snippets using \`pypdf\`.
2. Format the content into clean GitHub-flavored markdown.
3. Automatically append the document to \`js/docs-data.js\`.
4. Run \`scripts/sync_and_push.ps1\` to commit and push changes directly to \`origin main\`.
5. **Vercel** detects the Git commit webhook and deploys the update automatically in 15-30 seconds!

---

## Manual 1-Click Sync to Git

Whenever you make any changes locally, run:

\`\`\`powershell
npm run deploy
\`\`\`

Or directly:
\`\`\`powershell
powershell -ExecutionPolicy Bypass -File .\\scripts\\sync_and_push.ps1 "docs: your custom update note"
\`\`\`
`
  }
];
