-- ============================================================================
--                    SATANSHU'S NEOVIM CORE KEYMAPS
-- ============================================================================

-- KEYMAP HELPER FUNCTION
local function set_keymap(mode, lhs, rhs, opts)
    vim.keymap.set(mode, lhs, rhs, opts or {})
end

-- ============================================================================
--                            GLOBAL KEYMAPS
-- ============================================================================

-- DISABLE SPACE IN NORMAL AND VISUAL MODE (SINCE IT'S OUR LEADER)
set_keymap({ 'n', 'v' }, '<Space>', '<Nop>', { silent = true })

-- BETTER MOVEMENT ON WRAPPED LINES
set_keymap('n', 'k', "v:count == 0 ? 'gk' : 'k'", { expr = true, silent = true })
set_keymap('n', 'j', "v:count == 0 ? 'gj' : 'j'", { expr = true, silent = true })

-- IMPROVED EDITING
set_keymap("n", "J", "mzJ`z", { desc = "JOIN LINES WITHOUT MOVING CURSOR" })
set_keymap("n", "<C-d>", "<C-d>zz", { desc = "HALF PAGE DOWN AND CENTER" })
set_keymap("n", "<C-u>", "<C-u>zz", { desc = "HALF PAGE UP AND CENTER" })

-- MOVE LINES IN VISUAL MODE
set_keymap("v", "K", ":m '<-2<CR>gv=gv", { desc = "MOVE SELECTION UP" })
set_keymap("v", "J", ":m '>+1<CR>gv=gv", { desc = "MOVE SELECTION DOWN" })

-- DELETE WITHOUT COPYING TO CLIPBOARD
set_keymap({ "n", "v" }, "<leader>d", [["_d]], { desc = 'DELETE WITHOUT COPYING' })
set_keymap("n", "<leader>dd", [["_dd]], { desc = 'DELETE LINE WITHOUT COPYING' })
set_keymap("v", "<leader><space>", [["_d]], { desc = 'DELETE WITHOUT COPYING' })

-- SYSTEM CLIPBOARD
set_keymap('n', '<leader>v', '"+p', { desc = 'PASTE FROM SYSTEM CLIPBOARD' })

set_keymap('n', '<leader>fs', '<CMD>Oil<CR>', { desc = "OPEN FILE EXPLORER" })

set_keymap('n', '[d', function() vim.diagnostic.jump({ count = -1, float = true }) end, { desc = 'PREVIOUS DIAGNOSTIC' })
set_keymap('n', ']d', function() vim.diagnostic.jump({ count = 1, float = true }) end, { desc = 'NEXT DIAGNOSTIC' })
set_keymap('n', '<leader>e', vim.diagnostic.open_float, { desc = 'OPEN DIAGNOSTIC FLOAT' })
set_keymap('n', '<leader>q', vim.diagnostic.setloclist, { desc = 'OPEN DIAGNOSTICS LIST' })