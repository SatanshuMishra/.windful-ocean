-- ============================================================================
--                    LANGUAGE SERVER CONFIGURATIONS
-- ============================================================================

local M = {}

local typescript_inlay_hints = {
    includeInlayParameterNameHints = 'all',
    includeInlayParameterNameHintsWhenArgumentMatchesName = false,
    includeInlayFunctionParameterTypeHints = true,
    includeInlayVariableTypeHints = true,
    includeInlayPropertyDeclarationTypeHints = true,
    includeInlayFunctionLikeReturnTypeHints = true,
    includeInlayEnumMemberValueHints = true,
}

local servers = {
    lua_ls = {
        settings = {
            Lua = {
                workspace = { checkThirdParty = false },
                telemetry = { enable = false },
                hint = { enable = true },
                format = { enable = false },
            },
        },
    },

    ts_ls = {
        settings = {
            typescript = { inlayHints = typescript_inlay_hints },
            javascript = { inlayHints = typescript_inlay_hints },
        },
    },

    rust_analyzer = {
        settings = {
            ['rust-analyzer'] = {
                check = { command = "clippy" },
                cargo = {
                    allFeatures = true,
                    buildScripts = { enable = true },
                },
                procMacro = { enable = true },
                inlayHints = {
                    chainingHints = { enable = true },
                    parameterHints = { enable = true },
                    typeHints = { enable = true },
                },
            },
        },
    },

    intelephense = {
        settings = {
            intelephense = {
                stubs = {
                    "bcmath", "bz2", "Core", "curl", "date", "dom", "fileinfo",
                    "filter", "gd", "gettext", "hash", "iconv", "imap", "intl",
                    "json", "libxml", "mbstring", "mcrypt", "mysql", "mysqli",
                    "password", "pcntl", "pcre", "PDO", "pdo_mysql", "pdo_pgsql",
                    "pdo_sqlite", "pgsql", "Phar", "posix", "pspell", "readline",
                    "recode", "redis", "Reflection", "session", "SimpleXML", "soap",
                    "sockets", "sodium", "SPL", "sqlite3", "standard", "superglobals",
                    "tokenizer", "xml", "xmlreader", "xmlrpc", "xmlwriter", "xsl",
                    "Zend OPcache", "zip", "zlib"
                },
                files = { maxSize = 5000000 },
                diagnostics = { enable = true },
                format = { enable = true },
            },
        },
    },

    pylsp = {
        settings = {
            pylsp = {
                plugins = {
                    pycodestyle = { enabled = true, maxLineLength = 120 },
                    pyflakes = { enabled = true },
                    autopep8 = { enabled = true },
                    yapf = { enabled = false },
                    pylint = { enabled = false },
                    rope_autoimport = { enabled = true },
                    rope_completion = { enabled = true },
                },
            },
        },
    },

    html = {
        filetypes = { "html", "templ" },
    },

    cssls = {},

    tailwindcss = {
        filetypes = {
            "astro", "html", "css", "scss", "javascript",
            "javascriptreact", "typescript", "typescriptreact", "vue"
        },
    },

    astro = {},

    emmet_ls = {
        filetypes = {
            "css", "eruby", "html", "javascript", "javascriptreact",
            "less", "sass", "scss", "svelte", "pug", "typescriptreact",
            "vue", "astro"
        },
    },

    jsonls = {
        settings = {
            json = {
                validate = { enable = true },
            },
        },
    },

    sqlls = {
        filetypes = { "sql", "mysql", "postgresql", "sqlite3" },
        root_markers = { ".sqllsrc.json", ".git" },
        settings = {
            sqlLanguageServer = {
                connections = {
                    {
                        name = "mysql",
                        adapter = "mysql",
                        host = "localhost",
                        port = 3306,
                        user = "root",
                        database = "information_schema",
                    },
                    {
                        name = "postgresql",
                        adapter = "postgresql",
                        host = "localhost",
                        port = 5432,
                        user = "postgres",
                        database = "postgres",
                    },
                    {
                        name = "sqlite",
                        adapter = "sqlite3",
                        filename = ":memory:",
                    },
                },
            },
        },
    },

    eslint = {},

    yamlls = {
        settings = {
            yaml = {
                keyOrdering = false,
                format = { enable = true },
                validate = true,
                schemaStore = { enable = false, url = "" },
            },
        },
    },

    bashls = {},

    clangd = {
        cmd = {
            "clangd",
            "--background-index",
            "--clang-tidy",
            "--header-insertion=iwyu",
            "--completion-style=detailed",
            "--function-arg-placeholders",
            "--fallback-style=llvm",
        },
    },

    dockerls = {},

    marksman = {},
}

local function completion_capabilities()
    local ok, cmp_nvim_lsp = pcall(require, 'cmp_nvim_lsp')
    return ok and cmp_nvim_lsp.default_capabilities() or {}
end

local function json_schemas()
    local ok, schemastore = pcall(require, 'schemastore')
    return ok and schemastore.json.schemas() or {}
end

local function fix_eslint_problems_on_save(event)
    local client = vim.lsp.get_client_by_id(event.data.client_id)
    if not client or client.name ~= 'eslint' then
        return
    end
    vim.api.nvim_create_autocmd("BufWritePre", {
        group = vim.api.nvim_create_augroup('EslintFixOnSave' .. event.buf, { clear = true }),
        buffer = event.buf,
        command = "LspEslintFixAll",
    })
end

function M.setup()
    vim.lsp.config('*', { capabilities = completion_capabilities() })
    for name, config in pairs(servers) do
        vim.lsp.config(name, config)
    end
    vim.lsp.config('jsonls', { settings = { json = { schemas = json_schemas() } } })

    vim.api.nvim_create_autocmd('LspAttach', {
        group = vim.api.nvim_create_augroup('EslintFixOnSave', { clear = true }),
        callback = fix_eslint_problems_on_save,
    })

    vim.lsp.enable(vim.tbl_keys(servers))
end

return M
