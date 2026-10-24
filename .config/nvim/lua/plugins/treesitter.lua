-- ============================================================================
--                       SYNTAX HIGHLIGHTING & TREESITTER
-- ============================================================================

local parsers = {
    'c', 'cpp', 'go', 'lua', 'python', 'rust', 'tsx',
    'javascript', 'typescript', 'vimdoc', 'vim', 'bash',
    'html', 'css', 'json', 'yaml', 'toml', 'php', 'sql', 'astro',
}

local function start_treesitter(event)
    if not pcall(vim.treesitter.start, event.buf) then
        return
    end
    local lang = vim.treesitter.language.get_lang(vim.bo[event.buf].filetype)
    if lang and vim.treesitter.query.get(lang, 'indents') then
        vim.bo[event.buf].indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
    end
end

local function textobject_move(direction, capture)
    return function()
        require('nvim-treesitter-textobjects.move')[direction](capture, 'textobjects')
    end
end

local function textobject_swap(direction)
    return function()
        require('nvim-treesitter-textobjects.swap')[direction]('@parameter.inner')
    end
end

return {
    {
        'nvim-treesitter/nvim-treesitter',
        branch = 'main',
        lazy = false,
        build = ':TSUpdate',
        config = function()
            if vim.fn.executable('tree-sitter') == 1 then
                require('nvim-treesitter').install(parsers)
            else
                vim.notify('tree-sitter CLI not found: run :MasonInstall tree-sitter-cli', vim.log.levels.WARN)
            end

            vim.api.nvim_create_autocmd('FileType', {
                group = vim.api.nvim_create_augroup('TreesitterFeatures', { clear = true }),
                callback = start_treesitter,
            })

            vim.keymap.set('n', '<C-space>', function() vim.treesitter.select('parent') end, { desc = 'SELECT NODE' })
            vim.keymap.set('x', '<C-space>', function() vim.treesitter.select('parent') end, { desc = 'EXPAND SELECTION' })
            vim.keymap.set('x', '<M-space>', function() vim.treesitter.select('child') end, { desc = 'SHRINK SELECTION' })
        end,
    },

    {
        'nvim-treesitter/nvim-treesitter-textobjects',
        branch = 'main',
        event = { "BufReadPost", "BufNewFile" },
        keys = {
            { ']m', textobject_move('goto_next_start', '@function.outer'), mode = { 'n', 'x', 'o' }, desc = 'NEXT FUNCTION START' },
            { ']]', textobject_move('goto_next_start', '@class.outer'), mode = { 'n', 'x', 'o' }, desc = 'NEXT CLASS START' },
            { ']M', textobject_move('goto_next_end', '@function.outer'), mode = { 'n', 'x', 'o' }, desc = 'NEXT FUNCTION END' },
            { '][', textobject_move('goto_next_end', '@class.outer'), mode = { 'n', 'x', 'o' }, desc = 'NEXT CLASS END' },
            { '[m', textobject_move('goto_previous_start', '@function.outer'), mode = { 'n', 'x', 'o' }, desc = 'PREVIOUS FUNCTION START' },
            { '[[', textobject_move('goto_previous_start', '@class.outer'), mode = { 'n', 'x', 'o' }, desc = 'PREVIOUS CLASS START' },
            { '[M', textobject_move('goto_previous_end', '@function.outer'), mode = { 'n', 'x', 'o' }, desc = 'PREVIOUS FUNCTION END' },
            { '[]', textobject_move('goto_previous_end', '@class.outer'), mode = { 'n', 'x', 'o' }, desc = 'PREVIOUS CLASS END' },
            { '<leader>a', textobject_swap('swap_next'), desc = 'SWAP WITH NEXT PARAMETER' },
            { '<leader>A', textobject_swap('swap_previous'), desc = 'SWAP WITH PREVIOUS PARAMETER' },
        },
        opts = {
            move = { set_jumps = true },
        },
    },
}
