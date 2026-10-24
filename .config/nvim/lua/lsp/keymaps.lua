-- ============================================================================
--                       LSP-SPECIFIC KEYMAPS
-- ============================================================================

local M = {}

local function telescope_picker(name)
    return function()
        require('telescope.builtin')[name]()
    end
end

local function map_buffer_keys(event)
    local bufnr = event.buf
    local client = vim.lsp.get_client_by_id(event.data.client_id)

    local function nmap(keys, func, desc)
        vim.keymap.set('n', keys, func, { buffer = bufnr, desc = 'LSP: ' .. desc })
    end

    nmap('gd', '<cmd>Glance definitions<CR>', 'GLANCE DEFINITIONS')
    nmap('gr', '<cmd>Glance references<CR>', 'GLANCE REFERENCES')
    nmap('gI', '<cmd>Glance implementations<CR>', 'GLANCE IMPLEMENTATIONS')
    nmap('gy', '<cmd>Glance type_definitions<CR>', 'GLANCE TYPE DEFINITIONS')

    nmap('<leader>ca', vim.lsp.buf.code_action, 'CODE ACTION')
    nmap('<leader>D', telescope_picker('lsp_type_definitions'), 'TYPE DEFINITION')
    nmap('<leader>docs', telescope_picker('lsp_document_symbols'), 'DOCUMENT SYMBOLS')
    nmap('<leader>ws', telescope_picker('lsp_dynamic_workspace_symbols'), 'WORKSPACE SYMBOLS')

    nmap('K', function() vim.lsp.buf.hover({ border = 'rounded' }) end, 'HOVER DOCUMENTATION')
    nmap('<C-k>', function() vim.lsp.buf.signature_help({ border = 'rounded' }) end, 'SIGNATURE HELP')

    nmap('<leader>wa', vim.lsp.buf.add_workspace_folder, 'ADD WORKSPACE FOLDER')
    nmap('<leader>wr', vim.lsp.buf.remove_workspace_folder, 'REMOVE WORKSPACE FOLDER')
    nmap('<leader>wl', function()
        print(vim.inspect(vim.lsp.buf.list_workspace_folders()))
    end, 'LIST WORKSPACE FOLDERS')

    nmap('gl', '<cmd>Lspsaga show_line_diagnostics<CR>', 'SHOW LINE DIAGNOSTICS')
    nmap('[e', '<cmd>Lspsaga diagnostic_jump_prev<CR>', 'PREVIOUS DIAGNOSTIC')
    nmap(']e', '<cmd>Lspsaga diagnostic_jump_next<CR>', 'NEXT DIAGNOSTIC')
    nmap('gp', '<cmd>Lspsaga peek_definition<CR>', 'PEEK DEFINITION')
    nmap('<leader>lo', '<cmd>Lspsaga outline<CR>', 'TOGGLE OUTLINE')

    if client and client.name ~= 'astro' and client:supports_method('textDocument/inlayHint') then
        vim.lsp.inlay_hint.enable(true, { bufnr = bufnr })
    end
end

function M.setup()
    vim.api.nvim_create_autocmd('LspAttach', {
        group = vim.api.nvim_create_augroup('LspBufferKeymaps', { clear = true }),
        callback = map_buffer_keys,
    })
end

return M
