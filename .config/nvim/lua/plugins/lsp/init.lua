-- ============================================================================
--                    LANGUAGE SERVER PROTOCOL SETUP
-- ============================================================================

-- ============================================================================
--                         DIAGNOSTIC CONFIGURATION
-- ============================================================================

-- DIAGNOSTIC CONFIGURATION
vim.diagnostic.config({
    virtual_text = {
        spacing = 4,
        source = "if_many",
        prefix = "●",
    },
    signs = true,
    underline = true,
    update_in_insert = false,
    severity_sort = true,
    float = {
        focusable = false,
        style = "minimal",
        border = "rounded",
        source = "always",
        header = "",
        prefix = "",
    },
})

-- DIAGNOSTIC SIGNS
local signs = { Error = " ", Warn = " ", Hint = " ", Info = " " }
for type, icon in pairs(signs) do
    local hl = "DiagnosticSign" .. type
    vim.fn.sign_define(hl, { text = icon, texthl = hl, numhl = hl })
end

-- LSP HANDLERS CONFIGURATION
vim.lsp.handlers["textDocument/hover"] = vim.lsp.with(
    vim.lsp.handlers.hover, { border = "rounded" }
)

vim.lsp.handlers["textDocument/signatureHelp"] = vim.lsp.with(
    vim.lsp.handlers.signature_help, { border = "rounded" }
)

-- ============================================================================
--                           LSP PLUGIN SPECIFICATIONS
-- ============================================================================

return {
    -- MAIN LSP CONFIGURATION
    {
        'neovim/nvim-lspconfig',
        event = { "BufReadPre", "BufNewFile" },
        dependencies = {
            'williamboman/mason.nvim',
            { 'j-hui/fidget.nvim', opts = {} },
            'folke/neodev.nvim',
        },
        config = function()
            -- DEFER LSP SETUP UNTIL ALL DEPENDENCIES ARE LOADED
            vim.api.nvim_create_autocmd("User", {
                pattern = "VeryLazy",
                callback = function()
                    -- SAFE MODULE LOADING FUNCTION
                    local function safe_require(module)
                        local ok, result = pcall(require, module)
                        return ok and result or nil
                    end

                    -- SETUP MASON PACKAGE MANAGER
                    local mason = safe_require("mason")
                    if not mason then
                        vim.notify("MASON NOT AVAILABLE", vim.log.levels.ERROR)
                        return
                    end

                    mason.setup({
                        install_root_dir = vim.fn.stdpath("data") .. "/mason",
                        PATH = "prepend",
                        log_level = vim.log.levels.INFO,
                        max_concurrent_installers = 2,
                        registries = { "github:mason-org/mason-registry" },
                        providers = { "mason.providers.registry-api", "mason.providers.client" },
                        github = { download_url_template = "https://github.com/%s/releases/download/%s/%s" },
                        pip = { upgrade_pip = false, install_args = {} },
                        ui = {
                            icons = {
                                package_installed = "✓",
                                package_pending = "➜",
                                package_uninstalled = "✗"
                            },
                        },
                    })

                    -- SETUP NEOVIM LUA DEVELOPMENT
                    local neodev = safe_require('neodev')
                    if neodev then
                        neodev.setup({
                            library = {
                                enabled = true,
                                runtime = true,
                                types = true,
                                plugins = true,
                            },
                            setup_jsonls = true,
                            lspconfig = true,
                            pathStrict = true,
                        })
                    end

                    -- LSP CAPABILITIES WITH CMP INTEGRATION
                    local cmp_nvim_lsp = safe_require('cmp_nvim_lsp')
                    local capabilities = vim.lsp.protocol.make_client_capabilities()
                    if cmp_nvim_lsp then
                        capabilities = cmp_nvim_lsp.default_capabilities(capabilities)
                    end

                    -- LOAD SERVER CONFIGURATIONS
                    require('lsp.servers').setup(capabilities)
                    
                    -- SETUP LSP KEYMAPS
                    require('lsp.keymaps').setup()
                end,
            })
        end,
    },

    -- JSON SCHEMA STORE
    {
        'b0o/schemastore.nvim',
        lazy = true,
        ft = { "json", "jsonc" }
    }
}