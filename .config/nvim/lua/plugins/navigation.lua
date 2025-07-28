-- ============================================================================
--                        FILE NAVIGATION & MANAGEMENT
-- ============================================================================

return {
    -- ========================================================================
    --                            OIL FILE MANAGER
    -- ========================================================================

    {
        'stevearc/oil.nvim',
        dependencies = { "nvim-tree/nvim-web-devicons" },
        cmd = "Oil",
        keys = {
            { "-", "<cmd>Oil<cr>", desc = "OPEN PARENT DIRECTORY" },
        },
        config = function()
            require("oil").setup({
                skip_confirm_for_simple_edits = true,
                view_options = {
                    show_hidden = true,
                    is_hidden_file = function(name, _)
                        return vim.startswith(name, ".") or vim.startswith(name, 'node_modules')
                    end,
                },
                keymaps = {
                    ["g?"] = "actions.show_help",
                    ["<CR>"] = "actions.select",
                    ["<C-s>"] = "actions.select_vsplit",
                    ["<C-h>"] = "actions.select_split",
                    ["<C-t>"] = "actions.select_tab",
                    ["<C-p>"] = "actions.preview",
                    ["<C-c>"] = "actions.close",
                    ["<C-l>"] = "actions.refresh",
                    ["-"] = "actions.parent",
                    ["_"] = "actions.open_cwd",
                    ["`"] = "actions.cd",
                    ["~"] = "actions.tcd",
                    ["gs"] = "actions.change_sort",
                    ["gx"] = "actions.open_external",
                    ["g."] = "actions.toggle_hidden",
                },
            })
        end,
    },

    -- ========================================================================
    --                           HARPOON QUICK ACCESS
    -- ========================================================================

    {
        'theprimeagen/harpoon',
        dependencies = { "nvim-lua/plenary.nvim" },
        keys = {
            { "<leader>fa", desc = "HARPOON ADD FILE" },
            { "<C-e>", desc = "HARPOON TOGGLE MENU" },
            { "<C-1>", desc = "HARPOON FILE 1" },
            { "<C-2>", desc = "HARPOON FILE 2" },
            { "<C-3>", desc = "HARPOON FILE 3" },
            { "<C-4>", desc = "HARPOON FILE 4" },
        },
        config = function()
            local harpoon_mark = require("harpoon.mark")
            local harpoon_ui = require("harpoon.ui")
            local set_keymap = vim.keymap.set

            -- HARPOON CONFIGURATION
            set_keymap("n", "<leader>fa", harpoon_mark.add_file, { desc = "HARPOON ADD FILE" })
            set_keymap("n", "<C-e>", harpoon_ui.toggle_quick_menu, { desc = "HARPOON TOGGLE MENU" })
            set_keymap("n", "<leader>fl", harpoon_ui.toggle_quick_menu, { desc = "HARPOON LIST" })

            -- HARPOON QUICK ACCESS
            for i = 1, 4 do
                set_keymap("n", "<C-" .. i .. ">", function() harpoon_ui.nav_file(i) end, 
                    { desc = "HARPOON FILE " .. i })
                set_keymap("n", "<leader>p" .. i, function() harpoon_ui.nav_file(i) end, 
                    { desc = "OPEN HARPOON FILE " .. i })
            end
        end,
    },
}