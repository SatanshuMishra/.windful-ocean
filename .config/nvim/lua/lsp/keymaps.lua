-- ============================================================================
--                       LSP-SPECIFIC KEYMAPS
-- ============================================================================

local M = {}

function M.setup()
    -- KEYMAP HELPER FUNCTION
    local function set_keymap(mode, lhs, rhs, opts)
        vim.keymap.set(mode, lhs, rhs, opts or {})
    end

    -- ========================================================================
    --                          GLOBAL LSP KEYMAPS
    -- ========================================================================

    -- DIAGNOSTIC NAVIGATION (ALREADY DEFINED IN CORE BUT REPEATED FOR CLARITY)
    set_keymap('n', '[d', vim.diagnostic.goto_prev, { desc = 'PREVIOUS DIAGNOSTIC' })
    set_keymap('n', ']d', vim.diagnostic.goto_next, { desc = 'NEXT DIAGNOSTIC' })
    set_keymap('n', '<leader>e', vim.diagnostic.open_float, { desc = 'OPEN DIAGNOSTIC FLOAT' })
    set_keymap('n', '<leader>q', vim.diagnostic.setloclist, { desc = 'OPEN DIAGNOSTICS LIST' })

    -- ========================================================================
    --                         LSPSAGA INTEGRATION
    -- ========================================================================

    -- LSPSAGA KEYMAPS (NON-CONFLICTING)
    vim.api.nvim_create_autocmd("LspAttach", {
        callback = function()
            -- CHECK IF LSPSAGA IS AVAILABLE
            local has_lspsaga = pcall(require, 'lspsaga')
            if has_lspsaga then
                set_keymap("n", "gl", "<cmd>Lspsaga show_line_diagnostics<CR>", { desc = "SHOW LINE DIAGNOSTICS" })
                set_keymap("n", "[e", "<cmd>Lspsaga diagnostic_jump_prev<CR>", { desc = "PREVIOUS DIAGNOSTIC" })
                set_keymap("n", "]e", "<cmd>Lspsaga diagnostic_jump_next<CR>", { desc = "NEXT DIAGNOSTIC" })
                set_keymap("n", "gp", "<cmd>Lspsaga peek_definition<CR>", { desc = "PEEK DEFINITION" })
                set_keymap("n", "<leader>lo", "<cmd>Lspsaga outline<CR>", { desc = "TOGGLE OUTLINE" })
            end
        end,
    })
end

return M