// public/js/footer-loader.js
document.addEventListener('DOMContentLoaded', () => {
    const footerPlaceholder = document.getElementById('footer-placeholder');
    if (!footerPlaceholder) return;

    fetch('/footer.html')
        .then(res => res.text())
        .then(html => {
            footerPlaceholder.innerHTML = html;
        })
        .catch(err => {
            console.error('Error loading footer:', err);
        });
});