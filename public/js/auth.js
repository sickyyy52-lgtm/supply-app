const showLogin = document.getElementById('show-login');
const showSignup = document.getElementById('show-signup');
const authShell = document.getElementById('auth-shell');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const authMessage = document.getElementById('auth-message');
const overlaySignupBtn = document.getElementById('overlay-signup-btn');
const overlayLoginBtn = document.getElementById('overlay-login-btn');
const authPageLoader = document.getElementById('auth-page-loader');

window.addEventListener('load', () => {
    setTimeout(() => {
        authPageLoader.classList.add('hide');
    }, 500);

    if (window.NextsUI) window.NextsUI.applyImageFallbacks();
});

function activateLoginMode() {
    authShell.classList.remove('signup-mode');
    showLogin.classList.add('active');
    showSignup.classList.remove('active');
    authMessage.textContent = '';
}

function activateSignupMode() {
    authShell.classList.add('signup-mode');
    showSignup.classList.add('active');
    showLogin.classList.remove('active');
    authMessage.textContent = '';
}

showLogin.addEventListener('click', activateLoginMode);
showSignup.addEventListener('click', activateSignupMode);
overlaySignupBtn.addEventListener('click', activateSignupMode);
overlayLoginBtn.addEventListener('click', activateLoginMode);

loginForm.addEventListener('submit', async(e) => {
    e.preventDefault();
    authMessage.style.color = '#1f8b54';
    authMessage.textContent = 'Signing in...';

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await res.json();

        if (res.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));

            authMessage.style.color = '#1f8b54';
            authMessage.textContent = 'Login successful. Redirecting...';

            if (window.NextsUI) {
                window.NextsUI.showToast('Logged in successfully', 'success');
            }

            setTimeout(() => {
                window.location.href = '/';
            }, 900);
        } else {
            authMessage.style.color = '#d92d20';
            authMessage.textContent = data.message || 'Login failed';

            if (window.NextsUI) {
                window.NextsUI.showToast(data.message || 'Login failed', 'error');
            }
        }
    } catch (error) {
        authMessage.style.color = '#d92d20';
        authMessage.textContent = 'Server error. Please try again.';

        if (window.NextsUI) {
            window.NextsUI.showToast('Server error. Please try again.', 'error');
        }
    }
});

signupForm.addEventListener('submit', async(e) => {
    e.preventDefault();
    authMessage.style.color = '#1f8b54';
    authMessage.textContent = 'Creating your account...';

    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value.trim();

    try {
        const res = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
        });

        const data = await res.json();

        if (res.ok) {
            authMessage.style.color = '#1f8b54';
            authMessage.textContent = 'Account created successfully. Please sign in.';
            signupForm.reset();

            if (window.NextsUI) {
                window.NextsUI.showToast('Signup successful. Please sign in.', 'success');
            }

            setTimeout(() => {
                activateLoginMode();
            }, 900);
        } else {
            authMessage.style.color = '#d92d20';
            authMessage.textContent = data.message || 'Signup failed';

            if (window.NextsUI) {
                window.NextsUI.showToast(data.message || 'Signup failed', 'error');
            }
        }
    } catch (error) {
        authMessage.style.color = '#d92d20';
        authMessage.textContent = 'Server error. Please try again.';

        if (window.NextsUI) {
            window.NextsUI.showToast('Server error. Please try again.', 'error');
        }
    }
});