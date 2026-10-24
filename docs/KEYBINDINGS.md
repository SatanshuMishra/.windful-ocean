# Keybindings Reference

This document provides a comprehensive reference for all keybindings across my development environment.

## Tmux

Prefix Key: `Ctrl-Space` (I changed it from the default `Ctrl-b`)

### Session Management
| Key | Action |
|-----|--------|
| `Ctrl-Space` `c` | Create new window |
| `Ctrl-Space` `d` | Detach from session |
| `Ctrl-Space` `s` | List sessions |
| `Ctrl-Space` `$` | Rename session |

### Window Management
| Key | Action |
|-----|--------|
| `Ctrl-Space` `n` | Next window |
| `Ctrl-Space` `p` | Previous window |
| `Ctrl-Space` `l` | Last window |
| `Ctrl-Space` `,` | Rename window |
| `Ctrl-Space` `&` | Kill window |
| `Shift-Left` | Previous window (without prefix) |
| `Shift-Right` | Next window (without prefix) |
| `Alt-H` | Previous window (vim-style) |
| `Alt-L` | Next window (vim-style) |

### Pane Management
| Key | Action |
|-----|--------|
| `Ctrl-Space` `"` | Split horizontal (new pane below) |
| `Ctrl-Space` `%` | Split vertical (new pane right) |
| `Ctrl-Space` `h/j/k/l` | Select pane (vim-style) |
| `Alt-Left/Right/Up/Down` | Select pane (arrows, no prefix) |
| `Ctrl-Space` `z` | Zoom/unzoom current pane |
| `Ctrl-Space` `x` | Kill current pane |

### Copy Mode (vi-mode)
| Key | Action |
|-----|--------|
| `Ctrl-Space` `[` | Enter copy mode |
| `v` | Begin selection |
| `Ctrl-v` | Rectangle selection |
| `y` | Copy selection and exit |
| `q` | Exit copy mode |

### Session Persistence
| Key | Action |
|-----|--------|
| `Ctrl-Space` `Ctrl-s` | Save session |
| `Ctrl-Space` `Ctrl-r` | Restore session |

### Tmux Navigation (with my vim-tmux-navigator setup)
| Key | Action |
|-----|--------|
| `Ctrl-h` | Navigate left (vim/tmux) |
| `Ctrl-j` | Navigate down (vim/tmux) |
| `Ctrl-k` | Navigate up (vim/tmux) |
| `Ctrl-l` | Navigate right (vim/tmux) |

---

## Neovim

Leader Key: `Space` (my choice for easy access)

### Core Editing
| Key | Mode | Action |
|-----|------|--------|
| `j` / `k` | Normal | Move by visual line when wrapped |
| `J` | Normal | Join lines without moving cursor |
| `K` | Visual | Move selection up |
| `J` | Visual | Move selection down |
| `<leader>d` | Normal/Visual | Delete without copying to clipboard |
| `<leader><space>` | Visual | Delete without copying to clipboard |
| `<leader>v` | Normal | Paste from system clipboard |

### File Operations
| Key | Action |
|-----|--------|
| `<leader>sf` | Search files (Telescope) |
| `<leader>sg` | Live grep (Telescope) |
| `<leader>sw` | Search word under cursor (Telescope) |
| `<leader>sh` | Search help tags (Telescope) |
| `<leader>gf` | Search git files (Telescope) |
| `<leader>?` | Recently opened files (Telescope) |
| `<leader><space>` | Find buffers (Telescope) |
| `<leader>/` | Fuzzy search in current buffer (Telescope) |
| `<leader>fs` | Open file explorer (Oil) |

### Harpoon Quick Access
| Key | Action |
|-----|--------|
| `<leader>fa` | Add file to harpoon |
| `<leader>fl` | Toggle harpoon list |
| `<C-e>` | Toggle harpoon menu |
| `<C-1>` to `<C-4>` | Navigate to harpoon file 1-4 |
| `<leader>p1` to `<leader>p4` | Open harpoon file 1-4 |

### LSP Operations
| Key | Action |
|-----|--------|
| `gd` | Go to definition (Glance) |
| `gr` | Go to references (Glance) |
| `gI` | Go to implementation (Glance) |
| `gy` | Go to type definition (Glance) |
| `<leader>D` | Type definition (Telescope) |
| `K` | Hover documentation |
| `<C-k>` | Signature help |
| `<leader>rn` | Rename symbol with live preview (inc-rename) |
| `<leader>ca` | Code actions |
| `<leader>cf` | Format buffer |
| `gl` | Show line diagnostics (Lspsaga) |
| `gp` | Peek definition (Lspsaga) |
| `<leader>lo` | Toggle symbol outline (Lspsaga) |
| `<leader>docs` | Document symbols (Telescope) |
| `<leader>ws` | Workspace symbols (Telescope) |
| `]d` | Next diagnostic, with its float |
| `[d` | Previous diagnostic, with its float |
| `]e` | Next diagnostic (Lspsaga) |
| `[e` | Previous diagnostic (Lspsaga) |
| `<leader>e` | Open diagnostic float |
| `<leader>q` | Open diagnostics list |

Every key in this table from `gd` to `[e`, other than `<leader>rn`, `<leader>cf`, `]d` and `[d`, is buffer-local: `lua/lsp/keymaps.lua` sets it when a language server attaches, so it exists only in a buffer with a server attached.

### Git Operations
| Key | Action |
|-----|--------|
| `<leader>gg` | Open LazyGit |
| `]c` | Next git hunk |
| `[c` | Previous git hunk |
| `<leader>hp` | Preview git hunk |
| `<leader>hs` | Stage git hunk |
| `<leader>hu` | Unstage git hunk |
| `<leader>hr` | Reset git hunk |
| `<leader>hb` | Blame current line |
| `<leader>hd` | Diff this |

### Debugging (DAP)
| Key | Action |
|-----|--------|
| `<leader>xb` | Toggle breakpoint |
| `<leader>xc` | Continue/start debugging |
| `<leader>xt` | Terminate debugging |
| `<leader>xo` | Step over |
| `<leader>xi` | Step into |
| `<leader>xO` | Step out |
| `<leader>xr` | Open REPL |
| `<leader>xu` | Toggle DAP UI |

### Code Screenshots (Silicon)
| Key | Mode | Action |
|-----|------|--------|
| `<leader>cs` | Visual | Screenshot code selection |

### Completion and Snippets
| Key | Mode | Action |
|-----|------|--------|
| `<Tab>` | Insert | Accept completion |
| `<C-n>` | Insert | Next completion item |
| `<C-p>` | Insert | Previous completion item |
| `<C-G>` | Insert | Accept Copilot suggestion |

### Session Management
| Key | Action |
|-----|--------|
| `<leader>ps` | Search sessions (Telescope) |
| `<leader>pr` | Restore session |
| `<leader>pS` | Save session |
| `<leader>pd` | Delete session |

### Navigation & Movement
| Key | Action |
|-----|--------|
| `s` | Flash jump (2-char search) |
| `S` | Flash treesitter jump |
| `<C-d>` | Half page down (centered) |
| `<C-u>` | Half page up (centered) |
| `n` | Next search result (centered) |
| `N` | Previous search result (centered) |

### Treesitter Selection and Motions
| Key | Mode | Action |
|-----|------|--------|
| `<C-space>` | Normal | Select the syntax node under the cursor |
| `<C-space>` | Visual | Expand selection to the parent node |
| `<M-space>` | Visual | Shrink selection to the child node |
| `]m` / `[m` | Normal/Visual/Operator | Next / previous function start |
| `]M` / `[M` | Normal/Visual/Operator | Next / previous function end |
| `]]` / `[[` | Normal/Visual/Operator | Next / previous class start |
| `][` / `[]` | Normal/Visual/Operator | Next / previous class end |
| `<leader>a` | Normal | Swap parameter with the next one |
| `<leader>A` | Normal | Swap parameter with the previous one |

### Text Objects (Mini.AI - part of my mini.nvim suite)
| Key | Action |
|-----|--------|
| `af` | Around function |
| `if` | Inside function |
| `ac` | Around class |
| `ic` | Inside class |
| `ao` | Around block/conditional/loop |
| `io` | Inside block/conditional/loop |

### Surround Operations (Mini.Surround - part of my mini.nvim suite)

Every surround key starts with `gs`, because `s` belongs to Flash.

| Key | Action |
|-----|--------|
| `gsa` | Add surrounding |
| `gsd` | Delete surrounding |
| `gsr` | Replace surrounding |
| `gsf` | Find surrounding (right) |
| `gsF` | Find surrounding (left) |
| `gsh` | Highlight surrounding |

### Comments (built into Neovim)
| Key | Action |
|-----|--------|
| `gcc` | Toggle line comment |
| `gc` | Toggle comment (visual/motion) |

### File Management (Oil.nvim - my file explorer)
| Key | Action |
|-----|--------|
| `-` | Open file explorer / go up a directory |
| `<CR>` | Open file/directory |
| `<C-s>` | Open in vertical split |
| `<C-h>` | Open in horizontal split |
| `<C-t>` | Open in new tab |
| `<C-l>` | Refresh |
| `<C-p>` | Preview file |

### Trouble (My diagnostics panel)
| Key | Action |
|-----|--------|
| `<leader>lp` | Toggle diagnostics panel |
| `<leader>lt` | Todo comments in Trouble |
| `<leader>lT` | Todo comments in Telescope |

### Todo Comments Navigation
| Key | Action |
|-----|--------|
| `]t` | Next TODO comment |
| `[t` | Previous TODO comment |

---

## Zsh Shell

### Directory Navigation (my enhanced setup)
| Command | Action |
|---------|--------|
| `z <partial-name>` | Jump to directory (zoxide) |
| `zi` | Interactive directory selection |
| `..` | Go up one directory |
| `...` | Go up two directories |
| `....` | Go up three directories |

### File Operations (my modern CLI tools)
| Command | Action |
|---------|--------|
| `ls` | List files (eza with icons) |
| `ll` | Detailed list with git status |
| `la` | List all files including hidden |
| `lt` | Tree view (2 levels) |
| `lta` | Tree view with hidden files |
| `cat <file>` | View file (bat with syntax highlighting) |
| `find <pattern>` | Find files (fd) |
| `grep <pattern>` | Search in files (ripgrep) |

### Git Shortcuts (my aliases)
| Command | Action |
|---------|--------|
| `gs` | `git status` |
| `ga` | `git add` |
| `gc` | `git commit` |
| `gp` | `git push` |
| `gl` | `git pull` |
| `gd` | `git diff` |
| `gco` | `git checkout` |
| `gb` | `git branch` |
| `glog` | Pretty git log with graph |

### System Utilities (my shortcuts)
| Command | Action |
|---------|--------|
| `c` | Clear screen |
| `v` | Open neovim |
| `home` | Go to home directory |
| `proj` | Go to projects directory |

### Docker (if installed)
| Command | Action |
|---------|--------|
| `dps` | `docker ps` |
| `dpsa` | `docker ps -a` |
| `di` | `docker images` |
| `dex` | `docker exec -it` |
| `dlog` | `docker logs` |

### Tmux Shortcuts (my aliases)
| Command | Action |
|---------|--------|
| `ta` | `tmux attach` |
| `tls` | `tmux list-sessions` |
| `tnew <name>` | `tmux new-session -s <name>` |
| `tkill <name>` | `tmux kill-session -t <name>` |

---

## FZF (Fuzzy Finder)

### Global FZF
| Key | Action |
|-----|--------|
| `Ctrl-T` | Find files in current directory |
| `Ctrl-R` | Search command history |
| `Alt-C` | Change directory (fuzzy) |

### Within FZF Interface
| Key | Action |
|-----|--------|
| `Ctrl-J/K` | Navigate up/down |
| `Tab` | Select multiple items |
| `Ctrl-A` | Select all |
| `Ctrl-D` | Deselect all |
| `Enter` | Confirm selection |
| `Esc` | Cancel |

---

## Tips

### Quick Reference
- Tmux prefix is `Ctrl-Space` (I find it easier to reach than `Ctrl-b`)
- Neovim leader is `Space` (my choice for comfort and accessibility)
- All my tools use consistent vim-style navigation (`hjkl`)
- Sessions auto-save but can be manually controlled
- My modern CLI tools have smart fallbacks to standard Unix tools

### My Custom Commands
- Use `which <command>` to see if my modern tools are active
- Check `$OS_NAME` variable to see my detected operating system
- Use `source ~/.zshrc` to reload my shell configuration
- Run `:checkhealth` in Neovim to verify my plugin status

### Getting Help
- Neovim: `:help <topic>` or `<leader>fh` for fuzzy help search
- Tmux: `Ctrl-Space ?` for my key bindings help
- Git: `git help <command>` for detailed git help
- Shell: `man <command>` for manual pages

Remember: Most of my tools support `--help` or `-h` flags for quick help!