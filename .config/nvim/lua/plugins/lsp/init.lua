-- ============================================================================
--                    LANGUAGE SERVER PROTOCOL SETUP
-- ============================================================================

local signs = { Error = "\u{f057} ", Warn = "\u{f071} ", Hint = "\u{f0eb} ", Info = "\u{f05a} " }
local severity = vim.diagnostic.severity

vim.diagnostic.config({
    virtual_text = {
        spacing = 4,
        source = "if_many",
        prefix = "●",
    },
    signs = {
        text = {
            [severity.ERROR] = signs.Error,
            [severity.WARN] = signs.Warn,
            [severity.HINT] = signs.Hint,
            [severity.INFO] = signs.Info,
        },
        numhl = {
            [severity.ERROR] = "DiagnosticSignError",
            [severity.WARN] = "DiagnosticSignWarn",
            [severity.HINT] = "DiagnosticSignHint",
            [severity.INFO] = "DiagnosticSignInfo",
        },
    },
    underline = true,
    update_in_insert = false,
    severity_sort = true,
    float = {
        focusable = false,
        style = "minimal",
        border = "rounded",
        source = true,
        header = "",
        prefix = "",
    },
})

-- ============================================================================
--                           LSP PLUGIN SPECIFICATIONS
-- ============================================================================

return {
    {
        'neovim/nvim-lspconfig',
        event = { "BufReadPre", "BufNewFile" },
        dependencies = {
            'mason-org/mason.nvim',
            { 'j-hui/fidget.nvim', opts = {} },
            'hrsh7th/cmp-nvim-lsp',
            'b0o/SchemaStore.nvim',
        },
        config = function()
            require('lsp.servers').setup()
            require('lsp.keymaps').setup()
        end,
    },

    {
        'mason-org/mason.nvim',
        cmd = { "Mason", "MasonInstall", "MasonUpdate" },
        opts = {
            PATH = "skip",
            max_concurrent_installers = 2,
            ui = {
                icons = {
                    package_installed = "✓",
                    package_pending = "➜",
                    package_uninstalled = "✗"
                },
            },
        },
    },

    {
        'folke/lazydev.nvim',
        ft = "lua",
        opts = {
            library = {
                { path = "${3rd}/luv/library", words = { "vim%.uv" } },
            },
        },
    },

    {
        'b0o/SchemaStore.nvim',
        lazy = true,
    },
}
