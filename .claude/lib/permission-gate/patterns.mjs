const BACKTICK = '\\x60';

const AT = `(?:^|[;&|(\\s"'${BACKTICK}]|\\$\\()\\s*`;

const WRAPPER = '(?:(?:sudo|doas|env|command|nohup|time|timeout|stdbuf|nice|xargs|(?:ba|z|k)?sh\\s+-c|'
  + `[A-Za-z_][A-Za-z0-9_]*=[^\\s]*)\\s+(?:["'${BACKTICK}]?\\s*)?)*`;

const PATH_PREFIX = '(?:[\\w.@~$-]*/)*';

const FLAGS = '(?:-{1,2}[\\w-]+(?:[= ][^\\s]+)?\\s+)*';

const TERM = `(?:[\\s"'${BACKTICK};&|)<>]|$)`;

export function command(names, tail = '') {
  return new RegExp(`${AT}${WRAPPER}${PATH_PREFIX}(?:${names})${tail || TERM}`, 'i');
}

export function subcommand(names, verb) {
  return command(names, `\\s+${FLAGS}(?:${verb})${TERM}`);
}

const GIT = '(?:^|[^a-zA-Z])git(?:\\s+-[^\\s]+(?:\\s+[^\\s]+)?)*\\s+';

export function gitVerb(tail) {
  return new RegExp(`${GIT}${tail}`, 'i');
}

export const SECRET_MATERIAL = new RegExp(
  '(?:'
  + '(?:^|[\\s"\'=@:/])(?:~|\\$HOME|\\$\\{HOME\\}|/Users/[\\w.-]+|/home/[\\w.-]+)?/?\\.ssh/'
  + '|\\.aws/credentials'
  + '|\\.netrc(?:[^.\\w-]|$)'
  + '|\\.git-credentials'
  + '|(?:^|[\\s"\'=@:/])id_(?:rsa|dsa|ecdsa|ed25519)(?:[^.\\w-]|$)'
  + '|\\.gnupg/'
  + '|\\.pgpass(?:[^.\\w-]|$)'
  + '|Library/Keychains/'
  + '|/etc/(?:shadow|master\\.passwd)'
  + '|-----BEGIN[A-Z ]*PRIVATE KEY-----'
  + ')',
  'i',
);

export const CREDENTIAL_FILE = new RegExp(
  `(?:${SECRET_MATERIAL.source}`
  + '|\\.npmrc(?:[^.\\w-]|$)'
  + '|\\.pypirc(?:[^.\\w-]|$)'
  + '|\\.cargo/credentials'
  + '|\\.kube/config(?:[^.\\w-]|$)'
  + '|\\.docker/config\\.json'
  + '|\\.config/gh/hosts\\.yml'
  + '|/etc/passwd'
  + '|\\.env(?:rc|\\.local|\\.production|\\.prod)?(?:[^.\\w-]|$)'
  + '|\\.(?:pem|p12|pfx|jks|keystore)(?:[^.\\w-]|$)'
  + ')',
  'i',
);

export const CREDENTIAL_PATH_TARGET = new RegExp(`(?:${CREDENTIAL_FILE.source}|\\.key(?:[^.\\w-]|$))`, 'i');

export const CREDENTIAL_LITERAL = new RegExp(
  '(?:'
  + 'sk-[A-Za-z0-9_-]{16,}'
  + '|gh[pousr]_[A-Za-z0-9]{16,}'
  + '|github_pat_[A-Za-z0-9_]{20,}'
  + '|xox[abprs]-[A-Za-z0-9-]{10,}'
  + '|(?:AKIA|ASIA)[0-9A-Z]{16}'
  + '|AIza[0-9A-Za-z_-]{30,}'
  + '|-----BEGIN[A-Z ]*PRIVATE KEY-----'
  + '|eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}'
  + ')',
);

export const CREDENTIAL_REFERENCE = new RegExp(
  '\\$\\{?[A-Za-z_][A-Za-z0-9_]*'
  + '(?:TOKEN|SECRET|PASSWORD|PASSWD|APIKEY|API_KEY|ACCESS_KEY|PRIVATE_KEY|CREDENTIALS?|SESSION_KEY)'
  + '[A-Za-z0-9_]*\\}?',
  'i',
);

export const EGRESS_BINARY = command('curl|wget|nc|ncat|netcat|scp|rsync|sftp|ftp|telnet|httpie|http|xh|ssh');

export const EGRESS_REACH = /(?:https?|ftp|scp|sftp|ssh):\/\/|[\w.-]+@[\w.-]+:[^\s]/i;

export const READER_BINARY = command(
  'cat|bat|less|more|head|tail|xxd|od|strings|base64|openssl|cp|mv|tar|zip|gzip|gpg|'
  + 'awk|sed|grep|egrep|fgrep|rg|ag|jq|yq|python3?|node|ruby|perl|php|printenv|source',
);

export const FORK_BOMB = /[\w:]+\s*\(\s*\)\s*\{\s*[\w:]+\s*\|\s*[\w:]+\s*&?\s*\}\s*;/;

export const UNBOUNDED_FILL = [
  /(?:^|[\s;&|])dd\s[^\n]*if=\/dev\/(?:zero|random|urandom)(?![^\n]*\bcount=)/i,
  /(?:^|[;&|]\s*)yes(?:\s+[^\s;&|]+)?\s*(?:\||>)/i,
];

const GUARD_NAME = '(?:settings(?:\\.local)?\\.json|CLAUDE\\.md|keybindings\\.json'
  + '|(?:hooks|rules|lib|workflows|releases|current|local|CUTOVER|LIVE|\\.cutover)(?:/|[^\\w./-]|$)'
  + '|[^/\\s]*\\.pre-cutover-[0-9a-f]+)';

export const GUARD_PATH = new RegExp(`(?:\\.claude/${GUARD_NAME}|\\.claude/?(?:[^\\w./-]|$))`);

export const GUARD_WRITE_VERB = new RegExp(
  '(?:>'
  + '|(?:^|[;&|\\s])tee\\s'
  + '|(?:^|[;&|\\s])sed\\s[^\\n]*-i'
  + '|(?:^|[;&|\\s])(?:mv|ln|mkdir|cp|rm|chmod|chown|truncate|install|shred)\\s'
  + '|(?:^|[;&|\\s])perl\\s+(?:-[^\\s]+\\s+)*-[0-9aCdDFlnpsSuUwWxX]*i'
  + `|${GIT}(?:checkout|restore)(?:\\s|$)`
  + ')',
);

export const GUARD_UNLOCK = /(?:^|[;&|\s])chflags\s+(?:-[^\s]+\s+)*[^\s]*nouchg(?:\s|$)/i;

export const CHECKPOINT_NAMESPACE = /refs\/reversibility\//i;

export const CHECKPOINT_DELETE = /(?:update-ref\s+(?:-d|--delete)|--delete|\bdelete\b|(?:^|[;&|\s])(?:rm|shred)\s)/i;

export const REFLOG_PRUNE = [
  gitVerb('reflog\\s+(?:expire|delete)'),
  gitVerb('gc\\b[^\\n]*--prune'),
  gitVerb('prune\\b[^\\n]*--expire'),
];

export const SNAPSHOT_DISABLE = /(?:^|[;&|\s])tmutil\s+(?:deletelocalsnapshots|deletesnapshot|disable|disablelocal|removedestination)/i;

export const TRASH_EMPTY = /(?:^|[;&|\s])(?:rm|trash|find|shred)\s[^\n]*(?:~|\$HOME|\$\{HOME\}|\/Users\/[\w.-]+)\/\.Trash/i;

export const REVERSIBILITY_JOB = /(?:^|[;&|\s])launchctl\s+(?:unload|bootout|disable|remove|stop)\b[^\n]*reversibility/i;

export const DEVICE_DESTRUCTION = [
  /(?:^|[;&|\s])dd\s[^\n]*of=\/dev\//i,
  command('mkfs(?:\\.[a-z0-9]+)?|newfs_[a-z]+'),
  />\s*\/dev\/(?:sd|disk|nvme|hd|rdisk)/i,
  /(?:^|[;&|\s])diskutil\s+(?:-[^\s]+\s+)*(?:eraseDisk|eraseVolume|zeroDisk|reformat|apfs\s+delete)/i,
];

export const SUDO_REMOVE = /(?:^|[;&|\s])(?:sudo|doas)\s+(?:-[^\s]+\s+)*(?:[\w./-]*\/)?(?:rm|shred|srm)(?:\s|$)/i;

export const SYSTEM_ROOT_TARGET = new RegExp(
  '(?:^|[;&|\\s])(?:rm|trash|shred)\\s+(?:-[^\\s]+\\s+)*'
  + '(?:/(?:\\s|$)|/(?:usr|bin|sbin|etc|var|System|Library|Applications|opt|private|Volumes|cores)(?:/|\\s|$))',
);

export const SUPABASE_BINARY = command('supabase');

export const SUPABASE_REMOTE_VERB = [
  subcommand('supabase', 'db\\s+(?:push|pull|dump|remote)'),
  subcommand('supabase', 'migration\\s+(?:up|repair|squash)'),
  subcommand('supabase', 'functions\\s+(?:deploy|delete)'),
  subcommand('supabase', 'link|unlink|projects|orgs|secrets|branches|domains|ssl-enforcement|network-restrictions'),
];

export const SUPABASE_REMOTE_FLAG = /--(?:linked|project-ref|project-id)(?:[=\s]|$)/i;

export const LOCAL_HOST = /^\[?(?:localhost|127(?:\.\d+){3}|0\.0\.0\.0|::1|host\.docker\.internal|db\.localhost|supabase_db[\w.-]*)\]?$/i;

export const DB_CLIENT = command('psql|pg_dump|pg_restore|pgbench|mysql|mysqldump|mongosh|mongo|redis-cli|clickhouse-client');

export const DB_URL = /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|rediss):\/\/(?:[^@\s]*@)?([^\s/:?]+)/i;

export const DB_HOST_FLAG = /(?:^|\s)(?:-h|--host)[=\s]+([^\s]+)/i;

export const DEPLOY_VERB = [
  subcommand('terraform|tofu', 'apply|destroy|import|taint|state\\s+rm'),
  subcommand('pulumi', 'up|destroy|refresh'),
  subcommand('flyctl|fly', 'deploy|apps\\s+destroy|secrets\\s+set|scale'),
  subcommand('vercel', 'deploy|--prod|promote|rollback|env\\s+(?:add|rm)'),
  subcommand('netlify', 'deploy'),
  subcommand('wrangler', 'publish|deploy|delete|secret\\s+put'),
  subcommand('firebase|amplify|sst|serverless|sls|eb|copilot|railway|render', 'deploy|push|publish|remove|delete'),
  subcommand('heroku', 'pg:reset|apps:destroy|releases:rollback|config:set'),
  subcommand('kubectl', 'delete|apply|drain|scale|rollout\\s+undo'),
  subcommand('helm', 'install|upgrade|uninstall|delete|rollback'),
  new RegExp(`${AT}${WRAPPER}${PATH_PREFIX}(?:aws|gcloud|az)\\s[^\\n]*(?:\\bdelete\\b|\\bterminate\\b|\\bdestroy\\b|\\bderegister\\b|\\bdeploy\\b|put-bucket-policy)`, 'i'),
  subcommand('docker', 'stack\\s+deploy|service\\s+update'),
];

export const EMAIL_SEND = [
  command('mail|mailx|sendmail|mutt|neomutt|msmtp|swaks|s-nail'),
  subcommand('aws', 'ses\\s+send-(?:email|raw-email|templated-email)'),
  new RegExp(`${AT}${WRAPPER}${PATH_PREFIX}(?:sendgrid|postmark|mailgun|resend)\\s[^\\n]*\\bsend\\b`, 'i'),
];

export const PACKAGE_PUBLISH = [
  subcommand('npm|pnpm|yarn|bun', 'publish|unpublish|deprecate|dist-tag\\s+add|owner\\s+(?:add|rm)'),
  subcommand('cargo', 'publish|yank|owner'),
  subcommand('gem', 'push'),
  subcommand('twine', 'upload'),
  subcommand('poetry', 'publish'),
  subcommand('nuget|dotnet\\s+nuget', 'push'),
  subcommand('docker|podman', 'push'),
  subcommand('flutter\\s+pub|dart\\s+pub', 'publish'),
  new RegExp(`${AT}${WRAPPER}${PATH_PREFIX}(?:mvn|mvnw)\\s[^\\n]*\\bdeploy\\b`, 'i'),
  new RegExp(`${AT}${WRAPPER}${PATH_PREFIX}(?:gradle|gradlew)\\s[^\\n]*\\bpublish\\b`, 'i'),
];

export const PAYMENT_CALL = [
  subcommand('stripe', '(?:charges|payment_intents|payouts|transfers|subscriptions|invoices)\\s+create'),
  new RegExp(`${AT}${WRAPPER}${PATH_PREFIX}(?:paypal|braintree|square|adyen)\\s[^\\n]*\\b(?:charge|payment|payout)\\b`, 'i'),
];

export const MAKE_PUBLIC = [
  /(?:^|[;&|\s])gh\s+repo\s+edit\b[^\n]*--visibility[=\s]+["']?public/i,
  /(?:^|[;&|\s])gh\s+api\b[^\n]*visibility[=:]\s*["']?public/i,
  /--acl[=\s]+["']?(?:public-read|public-read-write)/i,
  /(?:^|[;&|\s])gsutil\s+(?:acl\s+ch|iam\s+ch)\b[^\n]*(?:allUsers|allAuthenticatedUsers)/i,
  /--grant-(?:read|full-control)[=\s]+uri=http:\/\/acs\.amazonaws\.com\/groups\/global\/AllUsers/i,
  /(?:^|[;&|\s])gcloud\s[^\n]*add-iam-policy-binding[^\n]*allUsers/i,
];

export const SHARED_BRANCH = /^(?:main|master|develop|development|staging|stage|production|prod|trunk|next|release[/-][^\s]*|hotfix[/-][^\s]*)$/i;

export const GIT_PUSH = gitVerb('push(?:\\s|$)');

export const FORCE_FLAG = /(?:\s--force(?:$|[^-])|\s-[a-zA-Z]*f(?:\s|$))/;

export const FORCE_WITH_LEASE = /--force-with-lease/i;

export const DESTRUCTIVE_LOCAL = [
  gitVerb('reset\\b[^\\n]*--hard'),
  gitVerb('(?:checkout|restore)\\s+(?:--\\s+)?\\.(?:\\s|$)'),
  gitVerb('clean\\b[^\\n]*(?:-[a-zA-Z]*f|--force)'),
  gitVerb('stash\\s+(?:drop|clear|pop)(?:\\s|$)'),
  gitVerb('branch\\s+(?:-[a-zA-Z]*D|--delete\\s+--force|--force\\s+--delete)(?:\\s|$)'),
  gitVerb('(?:filter-branch|filter-repo)(?:\\s|$)'),
  /(?:^|[;&|\s])rm\s+(?:-[^\s]+\s+)*-?[^\s]*(?:r[a-zA-Z]*f|f[a-zA-Z]*r)/i,
  /(?:^|[;&|\s])rm\s[^\n]*(?:--recursive[^\n]*--force|--force[^\n]*--recursive)/i,
];

const GH = `(?:^|[;&|(\\s"'${BACKTICK}]|\\$\\()\\s*${WRAPPER}${PATH_PREFIX}gh\\s`;

export const GH_CALL = new RegExp(GH, 'i');

export const GH_API = new RegExp(`${GH}${FLAGS}api(?:\\s|$)`, 'i');

export const GH_PR_MERGE = new RegExp(`${GH}${FLAGS}pr\\s+merge(?:\\s|$)`, 'i');

export const GH_PR_CREATE = new RegExp(`${GH}${FLAGS}pr\\s+create(?:\\s|$)`, 'i');

export const GH_PR_EDIT = new RegExp(`${GH}${FLAGS}pr\\s+edit(?:\\s|$)`, 'i');

export const GH_PR_EDIT_TITLE_OR_BODY = /(?:--title|--body|--body-file)(?:[=\s]|$)|(?:^|\s)-(?:t|b|F)(?:[^\w-]|$)/;

export const GRAPHQL = /(?:^|\s)\/?graphql(?:\s|$)/i;

export const PULLS_ENDPOINT = /repos\/[^/\s]+\/[^/\s]+\/pulls\/?(?:[^/\w]|$)/i;

export const PULLS_NUMBERED = /repos\/[^/\s]+\/[^/\s]+\/pulls\/\d+(?:[^/\w]|$)/i;

export const PULLS_MERGE = /repos\/[^/\s]+\/[^/\s]+\/pulls\/[^/\s]+\/merge/i;

export const METHOD_POST = /--method[=\s]+post|-X\s*POST|(?:^|\s)-f\s|--field[=\s]|--raw-field[=\s]|(?:^|\s)--input[=\s]/i;

export const METHOD_PATCH = /--method[=\s]+patch|-X\s*PATCH/i;

export const GRAPHQL_MERGE_MUTATION = /(?:mergePullRequest|enablePullRequestAutoMerge|enqueuePullRequest)/i;

export const GRAPHQL_PR_MUTATION = /(?:createPullRequest|updatePullRequest)/i;

export const GRAPHQL_OPAQUE = new RegExp(`(?:(?:-f|--field|--raw-field)[=\\s]+[a-z_]+=@|(?:^|\\s)--input[=\\s]|\\$\\(|${BACKTICK})`, 'i');

export const RELEVANCE_TOKENS = Object.freeze([
  'rm', 'dd', 'mkfs', 'newfs', 'diskutil', 'chflags', 'chmod', 'chown', 'sudo', 'doas', 'truncate',
  'shred', 'srm', 'install', 'tee', 'ln ', 'mv ', 'cp ', 'sed', 'perl',
  'git', 'gh', 'trash', 'launchctl', 'tmutil', 'reflog', 'refs/', 'branch', 'stash', 'clean', 'reset',
  'prune', 'checkout', 'restore', 'filter-branch', 'filter-repo', 'push',
  'curl', 'wget', 'nc', 'ncat', 'netcat', 'scp', 'rsync', 'sftp', 'ftp', 'telnet', 'openssl', 'ssh',
  'http', 'xh', '://', '@',
  'supabase', 'psql', 'pg_', 'mysql', 'mongo', 'redis', 'clickhouse', 'pgbench',
  'terraform', 'tofu', 'pulumi', 'fly', 'vercel', 'netlify', 'wrangler', 'firebase', 'amplify', 'sst',
  'serverless', 'sls', 'heroku', 'kubectl', 'helm', 'aws', 'gcloud', 'az ', 'docker', 'podman',
  'copilot', 'eb ', 'railway', 'render',
  'npm', 'pnpm', 'yarn', 'bun', 'cargo', 'gem', 'twine', 'poetry', 'mvn', 'gradle', 'nuget', 'dotnet',
  'flutter', 'dart', 'publish', 'deploy', 'stripe', 'paypal', 'braintree', 'square', 'adyen',
  'mail', 'sendmail', 'mutt', 'msmtp', 'swaks', 's-nail', 'ses', 'sendgrid', 'postmark', 'mailgun',
  'resend',
  '.claude', '.ssh', '.aws', '.env', '.netrc', '.npmrc', '.pypirc', '.pgpass', '.gnupg', '.kube',
  '.docker', '.cargo', '.trash', 'keychain', 'credential', 'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519',
  'passwd', 'shadow', 'private key', 'secret', 'token', 'password', 'api_key', 'apikey', 'access_key',
  'sk-', 'ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_', 'github_pat_', 'xox', 'akia', 'asia', 'aiza', 'eyj',
  '.pem', '.p12', '.pfx', '.jks', '.keystore', '.key',
  '/dev/', 'yes', '(){', 'visibility', 'acl', 'allusers', 'iam', 'reversibility',
  'cat', 'base64', 'head', 'tail', 'strings', 'xxd', 'od ', 'gpg', 'printenv', 'less', 'more', 'bat',
  'tar', 'zip', 'gzip', 'awk', 'grep', 'jq', 'yq', 'python', 'node', 'ruby', 'php', 'source',
]);

const RELEVANCE = new RegExp(
  RELEVANCE_TOKENS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'i',
);

export function mentionsAnyTrigger(text) {
  return RELEVANCE.test(text);
}

export function matchesAny(patterns, text) {
  return patterns.some((pattern) => pattern.test(text));
}
