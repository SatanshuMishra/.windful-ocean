-- ============================================================================
--                    LANGUAGE SERVER CONFIGURATIONS
-- ============================================================================

local M = {}

function M.setup(capabilities)
    -- SAFE MODULE LOADING FUNCTION
    local function safe_require(module)
        local ok, result = pcall(require, module)
        return ok and result or nil
    end

    -- CONFIGURE LSP SERVERS DIRECTLY
    local lspconfig = safe_require('lspconfig')
    if not lspconfig then
        vim.notify("LSPCONFIG NOT AVAILABLE", vim.log.levels.ERROR)
        return
    end

    -- ENHANCED ON_ATTACH FUNCTION
    local function on_attach(client, bufnr)
        -- HELPER FOR BUFFER-LOCAL KEYMAPS
        local function nmap(keys, func, desc)
            if desc then desc = 'LSP: ' .. desc end
            vim.keymap.set('n', keys, func, { buffer = bufnr, desc = desc })
        end

        -- LSP NAVIGATION AND ACTIONS
        nmap('<leader>rn', vim.lsp.buf.rename, 'RENAME')
        nmap('<leader>ca', vim.lsp.buf.code_action, 'CODE ACTION')
        
        -- SAFE TELESCOPE INTEGRATION
        local telescope_builtin = safe_require('telescope.builtin')
        if telescope_builtin then
            nmap('gd', telescope_builtin.lsp_definitions, 'GOTO DEFINITION')
            nmap('gr', telescope_builtin.lsp_references, 'GOTO REFERENCES')
            nmap('gI', telescope_builtin.lsp_implementations, 'GOTO IMPLEMENTATION')
            nmap('<leader>D', telescope_builtin.lsp_type_definitions, 'TYPE DEFINITION')
            nmap('<leader>docs', telescope_builtin.lsp_document_symbols, 'DOCUMENT SYMBOLS')
            nmap('<leader>ws', telescope_builtin.lsp_dynamic_workspace_symbols, 'WORKSPACE SYMBOLS')
        else
            -- FALLBACK TO BUILT-IN LSP FUNCTIONS
            nmap('gd', vim.lsp.buf.definition, 'GOTO DEFINITION')
            nmap('gr', vim.lsp.buf.references, 'GOTO REFERENCES')
            nmap('gI', vim.lsp.buf.implementation, 'GOTO IMPLEMENTATION')
            nmap('<leader>D', vim.lsp.buf.type_definition, 'TYPE DEFINITION')
        end
        
        -- USE NATIVE LSP HOVER (LSPSAGA HANDLES ITS OWN)
        nmap('K', vim.lsp.buf.hover, 'HOVER DOCUMENTATION')
        nmap('<C-k>', vim.lsp.buf.signature_help, 'SIGNATURE HELP')
        
        -- WORKSPACE MANAGEMENT
        nmap('<leader>wa', vim.lsp.buf.add_workspace_folder, 'ADD WORKSPACE FOLDER')
        nmap('<leader>wr', vim.lsp.buf.remove_workspace_folder, 'REMOVE WORKSPACE FOLDER')
        nmap('<leader>wl', function()
            print(vim.inspect(vim.lsp.buf.list_workspace_folders()))
        end, 'LIST WORKSPACE FOLDERS')

        -- ENABLE INLAY HINTS IF SUPPORTED
        if client.server_capabilities.inlayHintProvider and vim.lsp.inlay_hint then
            -- Special handling for astro LSP which has issues with inlay hints
            if client.name ~= "astro" then
                vim.lsp.inlay_hint.enable(bufnr, true)
            end
        end
    end

    -- ========================================================================
    --                       LANGUAGE SERVER SETUP
    -- ========================================================================

    -- LUA LANGUAGE SERVER
    lspconfig.lua_ls.setup({
        capabilities = capabilities,
        on_attach = on_attach,
        settings = {
            Lua = {
                workspace = { 
                    checkThirdParty = false,
                    library = {
                        vim.env.VIMRUNTIME,
                        "${3rd}/luv/library",
                        "${3rd}/busted/library",
                    },
                },
                telemetry = { enable = false },
                hint = { enable = true },
                format = { enable = false },
            },
        },
    })

    -- TYPESCRIPT/JAVASCRIPT
    lspconfig.ts_ls.setup({
        capabilities = capabilities,
        on_attach = on_attach,
        settings = {
            typescript = {
                inlayHints = {
                    includeInlayParameterNameHints = 'all',
                    includeInlayParameterNameHintsWhenArgumentMatchesName = false,
                    includeInlayFunctionParameterTypeHints = true,
                    includeInlayVariableTypeHints = true,
                    includeInlayPropertyDeclarationTypeHints = true,
                    includeInlayFunctionLikeReturnTypeHints = true,
                    includeInlayEnumMemberValueHints = true,
                }
            },
            javascript = {
                inlayHints = {
                    includeInlayParameterNameHints = 'all',
                    includeInlayParameterNameHintsWhenArgumentMatchesName = false,
                    includeInlayFunctionParameterTypeHints = true,
                    includeInlayVariableTypeHints = true,
                    includeInlayPropertyDeclarationTypeHints = true,
                    includeInlayFunctionLikeReturnTypeHints = true,
                    includeInlayEnumMemberValueHints = true,
                }
            }
        }
    })

    -- RUST ANALYZER
    lspconfig.rust_analyzer.setup({
        capabilities = capabilities,
        on_attach = on_attach,
        settings = {
            ['rust-analyzer'] = {
                checkOnSave = { command = "clippy" },
                cargo = { 
                    allFeatures = true,
                    loadOutDirsFromCheck = true,
                },
                procMacro = { enable = true },
                inlayHints = {
                    chainingHints = { enable = true },
                    parameterHints = { enable = true },
                    typeHints = { enable = true },
                },
            }
        }
    })

    -- PHP LANGUAGE SERVER
    lspconfig.intelephense.setup({
        capabilities = capabilities,
        on_attach = on_attach,
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
    })

    -- PYTHON LANGUAGE SERVER
    lspconfig.pylsp.setup({
        capabilities = capabilities,
        on_attach = on_attach,
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
                }
            }
        }
    })

    -- HTML
    lspconfig.html.setup({
        capabilities = capabilities,
        on_attach = on_attach,
        filetypes = { "html", "templ" },
    })

    -- CSS
    lspconfig.cssls.setup({
        capabilities = capabilities,
        on_attach = on_attach,
    })

    -- TAILWIND CSS
    lspconfig.tailwindcss.setup({
        capabilities = capabilities,
        on_attach = on_attach,
        filetypes = { 
            "astro", "html", "css", "scss", "javascript", 
            "javascriptreact", "typescript", "typescriptreact", "vue"
        },
    })

    -- ASTRO
    lspconfig.astro.setup({
        capabilities = capabilities,
        on_attach = on_attach,
    })

    -- EMMET
    lspconfig.emmet_ls.setup({
        capabilities = capabilities,
        on_attach = on_attach,
        filetypes = {
            "css", "eruby", "html", "javascript", "javascriptreact", 
            "less", "sass", "scss", "svelte", "pug", "typescriptreact", 
            "vue", "astro"
        },
    })

    -- JSON WITH SCHEMA SUPPORT
    local schemas = {}
    local schemastore = safe_require('schemastore')
    if schemastore and schemastore.json and schemastore.json.schemas then
        schemas = schemastore.json.schemas()
    end

    lspconfig.jsonls.setup({
        capabilities = capabilities,
        on_attach = on_attach,
        settings = {
            json = {
                schemas = schemas,
                validate = { enable = true },
            },
        },
    })

    -- SQL LANGUAGE SERVER
    lspconfig.sqlls.setup({
        capabilities = capabilities,
        on_attach = on_attach,
        cmd = { "sql-language-server", "up", "--method", "stdio" },
        filetypes = { "sql", "mysql", "postgresql", "sqlite3" },
        root_dir = function()
            local util = safe_require('lspconfig.util')
            if util then
                return util.root_pattern('.sqllsrc.json', '.git')(vim.api.nvim_buf_get_name(0))
            end
            return vim.fn.getcwd()
        end,
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
            }
        }
    })

    -- ESLINT
    lspconfig.eslint.setup({
        capabilities = capabilities,
        on_attach = function(client, bufnr)
            on_attach(client, bufnr)
            -- AUTO-FIX ON SAVE
            vim.api.nvim_create_autocmd("BufWritePre", {
                buffer = bufnr,
                command = "EslintFixAll",
            })
        end,
    })

    -- YAML
    lspconfig.yamlls.setup({
        capabilities = capabilities,
        on_attach = on_attach,
        settings = {
            yaml = {
                keyOrdering = false,
                format = { enable = true },
                validate = true,
                schemaStore = { enable = false, url = "" },
            }
        }
    })

    -- BASH
    lspconfig.bashls.setup({
        capabilities = capabilities,
        on_attach = on_attach,
    })

    -- C/C++
    lspconfig.clangd.setup({
        capabilities = capabilities,
        on_attach = on_attach,
        cmd = {
            "clangd",
            "--background-index",
            "--clang-tidy",
            "--header-insertion=iwyu",
            "--completion-style=detailed",
            "--function-arg-placeholders",
            "--fallback-style=llvm",
        },
    })

    -- DOCKER
    lspconfig.dockerls.setup({
        capabilities = capabilities,
        on_attach = on_attach,
    })

    -- MARKDOWN
    lspconfig.marksman.setup({
        capabilities = capabilities,
        on_attach = on_attach,
    })
end

return M