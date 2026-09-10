# Flask Security Reference

Security considerations specific to Flask applications.

---

## Secret Key Configuration

The `SECRET_KEY` is critical for session security, CSRF protection, and signed cookies.

### Vulnerable Patterns

```python
# VULNERABLE - Hardcoded secret
app.config['SECRET_KEY'] = 'my-secret-key'

# VULNERABLE - Weak secret
app.config['SECRET_KEY'] = 'dev'

# VULNERABLE - Predictable secret
app.config['SECRET_KEY'] = str(datetime.now())
```

### Secure Configuration

```python
import os
import secrets

# SECURE - Environment variable
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY')

# Fail fast if not set
if not app.config['SECRET_KEY']:
    raise RuntimeError("SECRET_KEY environment variable not set!")

# Generate strong secret for development
# python -c "import secrets; print(secrets.token_hex(32))"

# Or generate programmatically (store this, don't regenerate each start)
# secret_key = secrets.token_hex(32)
```

---

## Debug Mode in Production

### The Risk

```python
# NEVER in production - exposes:
# - Full stack traces
# - Interactive debugger (can execute code!)
# - Source code
# - Environment variables
app.run(debug=True)  # CRITICAL VULNERABILITY

# Werkzeug debugger allows arbitrary code execution
# /console endpoint with PIN = full server compromise
```

### Secure Configuration

```python
import os

# SECURE - Use environment variable
app.config['DEBUG'] = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'

# Or use Flask's built-in environment handling
# Set FLASK_ENV=production in environment

# Better: Use a config class
class ProductionConfig:
    DEBUG = False
    TESTING = False
    
class DevelopmentConfig:
    DEBUG = True
    
config = {
    'production': ProductionConfig,
    'development': DevelopmentConfig,
}

app.config.from_object(config[os.environ.get('FLASK_ENV', 'production')])
```

---

## Session Security

### Secure Session Configuration

```python
from datetime import timedelta

app.config.update(
    # Strong secret key
    SECRET_KEY=os.environ['SECRET_KEY'],
    
    # Session cookie settings
    SESSION_COOKIE_SECURE=True,      # HTTPS only
    SESSION_COOKIE_HTTPONLY=True,    # No JavaScript access
    SESSION_COOKIE_SAMESITE='Lax',   # CSRF protection
    SESSION_COOKIE_NAME='session',   # Don't reveal framework
    
    # Session lifetime
    PERMANENT_SESSION_LIFETIME=timedelta(hours=1),
)

# Use server-side sessions for sensitive data
# Flask-Session with Redis
from flask_session import Session

app.config['SESSION_TYPE'] = 'redis'
app.config['SESSION_REDIS'] = Redis.from_url(os.environ['REDIS_URL'])
app.config['SESSION_USE_SIGNER'] = True  # Sign session ID
Session(app)
```

### Session Security Patterns

```python
from flask import session
import secrets

# Regenerate session on login (prevent fixation)
@app.route('/login', methods=['POST'])
def login():
    # ... validate credentials ...
    
    # Clear old session
    session.clear()
    
    # Create new session
    session['user_id'] = user.id
    session['created_at'] = time.time()
    session['ip'] = request.remote_addr  # For validation
    session.permanent = True
    
    return redirect('/dashboard')

# Validate session on each request
@app.before_request
def validate_session():
    if 'user_id' in session:
        # Check session age
        created = session.get('created_at', 0)
        if time.time() - created > 3600:  # 1 hour
            session.clear()
            return redirect('/login')
        
        # Optional: Validate IP hasn't changed drastically
        # (careful with mobile users/VPNs)
```

The order above is load-bearing: `session.clear()` runs first, and only afterward are `user_id`, `created_at`, `ip` and `permanent` set. Calling `session.clear()` after populating those keys would discard the login state that was just written.

**There is no `session.regenerate()` in Flask.** It was proposed in [pallets/flask#1603](https://github.com/pallets/flask/pull/1603) and closed unmerged; a maintainer's stated reasoning: "The default session doesn't use a session id, and can be wiped with `session.clear()`." There is no session ID to rotate, because Flask's default session IS the signed cookie — `session.clear()` followed by rebuilding its contents, as above, is the whole mechanism, not a shortcut for something more complete.

If the app uses **Flask-Session** with a server-side backend (0.7.0+, released 2024-03-18), real session-ID rotation is available, but it lives on the session interface rather than on `session` itself: `app.session_interface.regenerate(session)`.

---

## CSRF Protection

### Using Flask-WTF

```python
from flask_wtf.csrf import CSRFProtect

csrf = CSRFProtect(app)

# Config
app.config['WTF_CSRF_ENABLED'] = True
app.config['WTF_CSRF_TIME_LIMIT'] = 3600  # 1 hour token validity
app.config['WTF_CSRF_SSL_STRICT'] = True  # Strict Referer checking for HTTPS
```

### In Templates

```html
<!-- Include CSRF token in forms -->
<form method="post">
    {{ csrf_token() }}
    <!-- or -->
    <input type="hidden" name="csrf_token" value="{{ csrf_token() }}"/>
    <!-- form fields -->
</form>
```

### For AJAX Requests

```javascript
// Get token from meta tag
const csrfToken = document.querySelector('meta[name="csrf-token"]').content;

fetch('/api/endpoint', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': csrfToken,
    },
    body: JSON.stringify(data),
});
```

```html
<!-- In base template -->
<meta name="csrf-token" content="{{ csrf_token() }}">
```

### Exempt Routes Carefully

```python
# Only exempt truly public endpoints
@csrf.exempt
@app.route('/webhook/stripe', methods=['POST'])
def stripe_webhook():
    # Verify webhook signature instead!
    sig = request.headers.get('Stripe-Signature')
    try:
        event = stripe.Webhook.construct_event(
            request.data, sig, webhook_secret
        )
    except ValueError:
        abort(400)
    # ... handle event
```

---

## SQL Injection Prevention

### Using SQLAlchemy ORM

```python
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy(app)

# SECURE - ORM methods
user = User.query.filter_by(email=email).first()
users = User.query.filter(User.name.like(f'%{search}%')).all()

# VULNERABLE - Raw query with f-string
db.session.execute(f"SELECT * FROM users WHERE email = '{email}'")

# SECURE - Parameterized raw query
from sqlalchemy import text

result = db.session.execute(
    text("SELECT * FROM users WHERE email = :email"),
    {'email': email}
)

# VULNERABLE - ORDER BY injection
User.query.order_by(request.args.get('sort')).all()

# SECURE - Whitelist columns
ALLOWED_SORT = {'name': User.name, 'email': User.email, 'created': User.created_at}
sort_column = ALLOWED_SORT.get(request.args.get('sort'), User.created_at)
User.query.order_by(sort_column).all()
```

---

## Input Validation

### Using Flask-WTF Forms

```python
from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, EmailField
from wtforms.validators import DataRequired, Email, Length, Regexp

class RegistrationForm(FlaskForm):
    email = EmailField('Email', validators=[
        DataRequired(),
        Email(),
        Length(max=254)
    ])
    password = PasswordField('Password', validators=[
        DataRequired(),
        Length(min=8, max=128)
    ])
    username = StringField('Username', validators=[
        DataRequired(),
        Length(min=3, max=30),
        Regexp(r'^[\w]+$', message='Alphanumeric characters only')
    ])

@app.route('/register', methods=['POST'])
def register():
    form = RegistrationForm()
    if form.validate_on_submit():
        # Safe to use form.email.data, form.password.data, etc.
        create_user(form.email.data, form.password.data, form.username.data)
        return redirect('/login')
    return render_template('register.html', form=form)
```

### Using Marshmallow

```python
from marshmallow import Schema, fields, validate, ValidationError

class UserSchema(Schema):
    email = fields.Email(required=True)
    password = fields.Str(required=True, validate=validate.Length(min=8, max=128))
    name = fields.Str(required=True, validate=validate.Length(min=1, max=100))
    # Explicitly exclude dangerous fields
    role = fields.Str(load_only=True)  # Can't be set via input

user_schema = UserSchema()

@app.route('/api/users', methods=['POST'])
def create_user():
    try:
        data = user_schema.load(request.json)
    except ValidationError as err:
        return jsonify({'errors': err.messages}), 400
    
    # Safe to use data
    user = User(**data)
    db.session.add(user)
    db.session.commit()
    return user_schema.dump(user), 201
```

---

## File Upload Security

```python
import os
import uuid
import magic  # pip install python-magic
from werkzeug.utils import secure_filename

UPLOAD_FOLDER = '/var/uploads'  # Outside webroot!
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}
MAX_FILE_SIZE = 5 * 1024 * 1024

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE

def validate_image_stream(stream):
    """Read first 2KB to check magic bytes without saving file"""
    header = stream.read(2048)
    stream.seek(0)  # Reset stream pointer!
    mime = magic.from_buffer(header, mime=True)
    return mime in ['image/jpeg', 'image/png', 'image/gif']

@app.route('/upload', methods=['POST'])
def upload_file():
    file = request.files.get('file')
    if not file or file.filename == '':
        return jsonify({'error': 'No file'}), 400

    # 1. Validate Extension (Weak check)
    ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
    if ext not in ALLOWED_EXTENSIONS:
        return jsonify({'error': 'Invalid extension'}), 400

    # 2. Validate Content (Strong check) - BEFORE saving
    if not validate_image_stream(file.stream):
        return jsonify({'error': 'Invalid file content'}), 400

    # 3. Save with Secure Name
    filename = f"{uuid.uuid4()}.{ext}"
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)

    return jsonify({'filename': filename}), 201
```

---

## Template Security (Jinja2)

### Auto-escaping

```python
# Flask enables auto-escaping by default for .html templates
# But be careful with other extensions

app.jinja_env.autoescape = True  # Ensure it's on
```

```html
<!-- SAFE - Auto-escaped -->
{{ user.name }}

<!-- VULNERABLE - Marking as safe (only if you sanitized it!) -->
{{ user.bio | safe }}
```

```python
# SECURE - Sanitize before marking safe
# pip install nh3
import nh3

@app.template_filter('sanitize')
def sanitize_html(value):
    # NH3 is faster and safer (Rust-based)
    return nh3.clean(
        value,
        tags={'p', 'br', 'strong', 'em', 'b', 'i'},
        attributes={},
        link_rel="noopener noreferrer"
    )
```

```html
<!-- In template -->
{{ user.bio | sanitize | safe }}
```

### Server-Side Template Injection

```python
# VULNERABLE - User input in template string
from flask import render_template_string

@app.route('/greet')
def greet():
    name = request.args.get('name')
    template = f"Hello, {name}!"  # SSTI vulnerability!
    return render_template_string(template)

# Attacker: ?name={{config.SECRET_KEY}}
# Attacker: ?name={{''.__class__.__mro__[2].__subclasses__()}}

# SECURE - Use template variables
@app.route('/greet')
def greet():
    name = request.args.get('name')
    return render_template_string("Hello, {{ name }}!", name=name)

# BETTER - Use template files
@app.route('/greet')
def greet():
    return render_template('greet.html', name=request.args.get('name'))
```

---

## Password Security

```python
from werkzeug.security import generate_password_hash, check_password_hash
# Or use argon2
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

# Using Werkzeug (default: scrypt since 2.3; pbkdf2 is the older, weaker option - never bcrypt)
class User(db.Model):
    password_hash = db.Column(db.String(256))
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

# Using Argon2 (recommended)
ph = PasswordHasher()

class User(db.Model):
    password_hash = db.Column(db.String(256))
    
    def set_password(self, password):
        self.password_hash = ph.hash(password)
    
    def check_password(self, password):
        try:
            return ph.verify(self.password_hash, password)
        except VerifyMismatchError:
            return False
```

`VerifyMismatchError` sits at the bottom of a hierarchy — `Exception → Argon2Error → VerificationError → VerifyMismatchError` — and catching only that leaf leaves a sibling, `InvalidHashError`, to propagate instead of being swallowed. `InvalidHashError` fires when the stored hash itself is malformed, and letting it propagate is intentional: a corrupted hash is a data problem, not a wrong password, and returning `False` for it would hide database corruption behind what looks like a failed login.

---

## Rate Limiting

```python
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"],
    storage_uri="redis://localhost:6379",
)

# Apply to specific routes
@app.route('/login', methods=['POST'])
@limiter.limit("5 per minute")  # Strict for auth
def login():
    # ...

@app.route('/api/search')
@limiter.limit("10 per minute")
def search():
    # ...

# Exempt certain routes
@app.route('/health')
@limiter.exempt
def health():
    return 'OK'
```

---

## Error Handling

```python
# VULNERABLE - Exposing errors
@app.errorhandler(Exception)
def handle_error(e):
    return jsonify({
        'error': str(e),
        'traceback': traceback.format_exc()  # NEVER in production!
    }), 500

# SECURE - Generic production errors
import logging
import uuid

@app.errorhandler(Exception)
def handle_error(e):
    error_id = str(uuid.uuid4())[:8]
    
    # Log detailed error server-side
    logging.error(f"Error {error_id}: {e}", exc_info=True)
    
    # Return generic message
    if app.debug:
        return jsonify({
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500
    else:
        return jsonify({
            'error': 'An internal error occurred',
            'reference': error_id
        }), 500

@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(403)
def forbidden(e):
    return jsonify({'error': 'Forbidden'}), 403
```

---

## Security Headers

```python
from flask_talisman import Talisman

# Apply security headers
talisman = Talisman(
    app,
    force_https=True,
    strict_transport_security=True,
    strict_transport_security_max_age=31536000,
    strict_transport_security_include_subdomains=True,
    content_security_policy={
        'default-src': "'self'",
        'script-src': "'self'",
        'style-src': "'self' 'unsafe-inline'",
        'img-src': "'self' data: https:",
    },
    referrer_policy='strict-origin-when-cross-origin',
    frame_options='DENY',
    content_security_policy_nonce_in=['script-src'],
)

# Or manually
@app.after_request
def add_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    return response
```

Browsers have removed `X-XSS-Protection` - Chrome dropped its XSS Auditor and Firefox never implemented the header - so it does nothing on a current browser and is omitted above. The `Content-Security-Policy` configured via Talisman is what actually blocks injected scripts today.

---

## Authentication with Flask-Login

```python
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from werkzeug.security import check_password_hash, generate_password_hash
import secrets

login_manager = LoginManager(app)
login_manager.login_view = 'login'
login_manager.session_protection = 'strong'  # Validates a per-session fingerprint each request; forces logout on mismatch (not a login-time regen)

# Computed once at startup so a lookup miss still pays for a real hash check
DUMMY_PASSWORD_HASH = generate_password_hash(secrets.token_hex(32))

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

@app.route('/login', methods=['POST'])
@limiter.limit("5 per minute")
def login():
    email = request.form.get('email')
    password = request.form.get('password')
    
    user = User.query.filter_by(email=email).first()
    
    # Run a password comparison even when the user doesn't exist, against a
    # dummy hash, so an unknown email costs the same time as a wrong password
    if user is not None:
        password_ok = user.check_password(password)
    else:
        password_ok = check_password_hash(DUMMY_PASSWORD_HASH, password)
    
    if user is not None and password_ok:
        login_user(user, remember=False)
        return redirect('/dashboard')
    
    # Same message for both invalid user and password (prevent enumeration)
    return render_template('login.html', error='Invalid credentials')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    session.clear()  # Clear all session data
    return redirect('/')

@app.route('/dashboard')
@login_required
def dashboard():
    return render_template('dashboard.html', user=current_user)
```

---

## Flask Security Checklist

### Configuration
- [ ] Strong `SECRET_KEY` from environment
- [ ] `DEBUG=False` in production
- [ ] CSRF protection enabled
- [ ] Session cookies: Secure, HttpOnly, SameSite

### Input/Output
- [ ] All input validated (WTForms, Marshmallow)
- [ ] SQL queries parameterized
- [ ] Templates auto-escaped
- [ ] No user input in template strings

### Authentication
- [ ] Passwords hashed with Argon2 or bcrypt
- [ ] Rate limiting on auth endpoints
- [ ] Sessions regenerated on login
- [ ] Same error message for all auth failures

### Files & Data
- [ ] File uploads validated (extension + magic bytes)
- [ ] Files stored outside webroot
- [ ] Random filenames for uploads
- [ ] Error messages don't expose internals

### Headers & HTTPS
- [ ] Security headers via Flask-Talisman
- [ ] HTTPS enforced
- [ ] HSTS enabled
