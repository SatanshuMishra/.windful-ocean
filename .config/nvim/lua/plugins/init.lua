-- ============================================================================
--                    LAZY.NVIM PLUGIN MANAGER SETUP
-- ============================================================================

-- INSTALL LAZY.NVIM PLUGIN MANAGER
local lazypath = vim.fn.stdpath('data') .. '/lazy/lazy.nvim'
if not vim.loop.fs_stat(lazypath) then
    vim.fn.system({
        'git', 'clone', '--filter=blob:none',
        'https://github.com/folke/lazy.nvim.git',
        '--branch=stable', lazypath,
    })
end
vim.opt.rtp:prepend(lazypath)

-- ============================================================================
--                          PLUGIN SPECIFICATIONS
-- ============================================================================

require('lazy').setup({
    -- IMPORT ALL PLUGIN MODULES
    { import = "plugins.mini" },
    { import = "plugins.lsp" },
    { import = "plugins.telescope" },
    { import = "plugins.completion" },
    { import = "plugins.treesitter" },
    { import = "plugins.debug" },
    { import = "plugins.git" },
    { import = "plugins.navigation" },
    { import = "plugins.ui" },
    { import = "plugins.editor" },
    { import = "plugins.tools" },
    { import = "plugins.utilities" },

    -- FORMATTING AND LINTING
    {
        'stevearc/conform.nvim',
        event = { "BufWritePre" },
        cmd = { "ConformInfo" },
        keys = {
            { "<leader>cf", function() require("conform").format({ async = true }) end, desc = "FORMAT BUFFER" },
        },
        dependencies = { 'mason.nvim' },
        config = function()
            require("conform").setup({
                formatters_by_ft = {
                    -- FRONTEND
                    javascript = { "prettier" },
                    typescript = { "prettier" },
                    javascriptreact = { "prettier" },
                    typescriptreact = { "prettier" },
                    vue = { "prettier" },
                    css = { "prettier" },
                    scss = { "prettier" },
                    less = { "prettier" },
                    html = { "prettier" },
                    json = { "prettier" },
                    jsonc = { "prettier" },
                    yaml = { "prettier" },
                    markdown = { "prettier" },
                    astro = { "prettier" },
                    
                    -- SCRIPTING
                    lua = { "stylua" },
                    python = { "black" },
                    
                    -- SYSTEMS
                    rust = { "rustfmt" },
                    go = { "gofmt" },
                    
                    -- WEB BACKEND
                    php = { "php_cs_fixer" },
                    
                    -- DATA
                    sql = { "sql_formatter" },
                    
                    -- SHELL
                    sh = { "shfmt" },
                    bash = { "shfmt" },
                },
                
                -- FORMATTER CONFIGURATIONS
                formatters = {
                    prettier = {
                        prepend_args = { "--prose-wrap", "always" },
                    },
                    stylua = {
                        prepend_args = { "--indent-type", "Spaces", "--indent-width", "4" },
                    },
                    black = {
                        prepend_args = { "--line-length", "120" },
                    },
                    sql_formatter = {
                        prepend_args = { "--config", "{\"language\": \"mysql\", \"indent\": \"    \"}" },
                    },
                },
                
                -- FORMAT ON SAVE
                format_on_save = function(bufnr)
                    -- ONLY FORMAT IF LSP CLIENT IS ATTACHED
                    if next(vim.lsp.get_clients({ bufnr = bufnr })) then
                        return { timeout_ms = 500, lsp_fallback = true }
                    end
                    return false
                end,
            })
        end,
    },
    
    {
        'mfussenegger/nvim-lint',
        event = { "BufReadPre", "BufNewFile", "BufWritePre" },
        dependencies = { 'mason.nvim' },
        config = function()
            local lint = require("lint")
            
            lint.linters_by_ft = {
                javascript = { "eslint_d" },
                typescript = { "eslint_d" },
                javascriptreact = { "eslint_d" },
                typescriptreact = { "eslint_d" },
                php = { "phpcs" },
                sql = { "sqlfluff" },
            }
            
            -- LINTER CONFIGURATIONS
            lint.linters.phpcs.args = {
                "--standard=.phpcs.xml",
                "--report=json",
                "-q",
                "--stdin-path=$FILENAME",
                "-"
            }
            
            lint.linters.sqlfluff.args = {
                "lint",
                "--dialect", "mysql",
                "--format", "json",
                "--exclude-rules", "L010,L014,L019,L030,L031,L057,L059",
                "-"
            }
            
            -- LINT ON EVENTS
            vim.api.nvim_create_autocmd({ "BufWritePost", "BufReadPost", "InsertLeave" }, {
                callback = function()
                    lint.try_lint()
                end,
            })
        end,
    },

}, {
    -- LAZY.NVIM CONFIGURATION
    root = vim.fn.stdpath("data") .. "/lazy",
    lockfile = vim.fn.stdpath("config") .. "/lazy-lock.json",
    dev = { path = "~/projects" },
    install = { missing = true, colorscheme = { "oxocarbon", "habamax" } },
    ui = { border = "rounded" },
    checker = { enabled = false },
    change_detection = { enabled = true, notify = false },
    performance = {
        rtp = {
            disabled_plugins = {
                "gzip", "matchit", "matchparen", "netrwPlugin",
                "tarPlugin", "tohtml", "tutor", "zipPlugin",
            },
        },
    },
})

