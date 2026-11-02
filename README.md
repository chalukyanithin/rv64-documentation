# Yantra RV64 System Documentation

A technical documentation platform for the **Yantra RISC-V 64-bit Full-System Emulator** (`RV64GC`), designed with a warm editorial aesthetic and zero-dependency static architecture.

---

## ⚡ Overview & Architectural Coverage

This documentation suite details the implementation and hardware mechanics of the 64-bit RISC-V full-system emulator:

- **Module 1**: RV64I Base Integer ISA, general-purpose register state (`x0`–`x31`), hardwired zero mechanics, and immediate sign-extension.
- **RV64 Register Model**: ABI conventions, caller/callee save constraints, and floating-point registers.
- **Module 2**: Sv39 Memory Management Unit (MMU), 3-level page table walking, PTE permission flags (`V`, `R`, `W`, `X`, `U`, `A`, `D`), and TLB caching.
- **Module 3**: Privileged architecture (Machine, Supervisor, User modes), Control & Status Registers (CSRs), trap delegation (`medeleg`/`mideleg`), and trap entry/return flow.
- **Module 4**: Standard ISA extensions (M integer multiplication/division, A atomics with Load-Reserved/Store-Conditional, F/D single & double floating-point with NaN-boxing, C compressed instructions, Zicsr, and Zifencei).
- **Module 5**: System peripherals & interrupt controllers (SiFive CLINT timers, SiFive PLIC interrupt routing, UART 16550A serial console, and VirtIO-MMIO block storage).
- **Devices & Platform**: Peripherals memory map and full Linux 6.8 boot flow with BusyBox shell initialization.
- **Guides**: C++20 build toolchain setup and compilation.

---

## 🎨 Design Philosophy

- **Typography**: Editorial layout combining Plus Jakarta Sans for high-legibility headings and JetBrains Mono for assembly and C++20 emulator code.
- **Formula Rendering**: KaTeX integration for mathematical proofs and address calculation equations.
- **Interactive Inspector**: Built-in interactive register explorer for real-time inspection of 64-bit register states and reset vectors.
- **Fast Client-Side Search**: Instant fuzzy full-text search across all specifications via `Ctrl + K`.

---

## 💻 Local Development

Run with any local static HTTP server:

```bash
# Using Node.js
npm start

# Or using Python
python -m http.server 3000
```

Then open `http://localhost:3000` in any modern web browser.

---

## 📄 License

This documentation is released under the [MIT License](LICENSE).
