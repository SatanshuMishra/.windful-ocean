-- ============================================================================
--                    SATANSHU'S NEOVIM CORE OPTIONS
-- ============================================================================

-- SET LEADER KEYS EARLY TO PREVENT CONFLICTS
vim.g.mapleader = ' '
vim.g.maplocalleader = ' '

-- ============================================================================
--                            EDITOR BEHAVIOR
-- ============================================================================

local opt = vim.opt

-- INDENTATION AND WHITESPACE
opt.tabstop = 4          -- NUMBER OF SPACES THAT A TAB COUNTS FOR
opt.softtabstop = 4      -- NUMBER OF SPACES FOR TAB IN INSERT MODE
opt.shiftwidth = 4       -- NUMBER OF SPACES FOR AUTOINDENT
opt.expandtab = true     -- USE SPACES INSTEAD OF TABS
opt.smartindent = true   -- SMART AUTOINDENTING FOR NEW LINES

-- LINE NUMBERS AND VISUAL AIDS
opt.number = true         -- SHOW LINE NUMBERS
opt.relativenumber = true -- SHOW RELATIVE LINE NUMBERS
opt.signcolumn = 'yes'   -- ALWAYS SHOW SIGN COLUMN
opt.cursorline = true    -- HIGHLIGHT CURRENT LINE

-- SEARCH BEHAVIOR
opt.hlsearch = false     -- DON'T HIGHLIGHT ALL SEARCH MATCHES
opt.incsearch = true     -- INCREMENTAL SEARCH
opt.ignorecase = true    -- IGNORE CASE IN SEARCH
opt.smartcase = true     -- CASE SENSITIVE IF UPPERCASE PRESENT

-- EDITOR BEHAVIOR
opt.mouse = 'a'                    -- ENABLE MOUSE IN ALL MODES
opt.clipboard = 'unnamedplus'      -- USE SYSTEM CLIPBOARD
opt.breakindent = true             -- WRAPPED LINES CONTINUE INDENTED
opt.undofile = true                -- PERSISTENT UNDO HISTORY
opt.updatetime = 250               -- FASTER COMPLETION AND DIAGNOSTICS
opt.timeoutlen = 300               -- TIME TO WAIT FOR MAPPED SEQUENCE
opt.completeopt = 'menuone,noselect' -- COMPLETION BEHAVIOR
opt.termguicolors = true           -- ENABLE 24-BIT RGB COLORS
opt.scrolloff = 8                  -- KEEP 8 LINES VISIBLE ABOVE/BELOW CURSOR
opt.sidescrolloff = 8              -- KEEP 8 COLUMNS VISIBLE LEFT/RIGHT

-- VISUAL CUSTOMIZATION
opt.fillchars:append('eob', ' ')    -- REMOVE ~ AT END OF BUFFER
opt.fillchars:append('fold', ' ')   -- CLEAN FOLD APPEARANCE
opt.fillchars:append('foldopen', 'v')
opt.fillchars:append('foldsep', ' ')
opt.fillchars:append('foldclose', '>')