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
        'ThePrimeagen/harpoon',
        branch = 'harpoon2',
        dependencies = { "nvim-lua/plenary.nvim" },
        keys = function()
            local function toggle_menu()
                local harpoon = require('harpoon')
                harpoon.ui:toggle_quick_menu(harpoon:list())
            end
            local keys = {
                { "<leader>fa", function() require('harpoon'):list():add() end, desc = "HARPOON ADD FILE" },
                { "<C-e>", toggle_menu, desc = "HARPOON TOGGLE MENU" },
                { "<leader>fl", toggle_menu, desc = "HARPOON LIST" },
            }
            for i = 1, 4 do
                local select_file = function() require('harpoon'):list():select(i) end
                table.insert(keys, { "<C-" .. i .. ">", select_file, desc = "HARPOON FILE " .. i })
                table.insert(keys, { "<leader>p" .. i, select_file, desc = "OPEN HARPOON FILE " .. i })
            end
            return keys
        end,
        config = function()
            require('harpoon'):setup()
        end,
    },
}