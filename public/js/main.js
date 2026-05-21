document.addEventListener('DOMContentLoaded', function() {
  const toggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('.nav-links');

  if (toggle && navLinks) {
    toggle.addEventListener('click', function(e) {
      e.stopPropagation();
      toggle.classList.toggle('active');
      navLinks.classList.toggle('active');
    });

    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', function() {
        toggle.classList.remove('active');
        navLinks.classList.remove('active');
      });
    });

    document.addEventListener('click', function(e) {
      if (!e.target.closest('.nav-container')) {
        toggle.classList.remove('active');
        navLinks.classList.remove('active');
      }
    });
  }

  const confirmForms = document.querySelectorAll('form[data-confirm]');
  confirmForms.forEach(form => {
    form.addEventListener('submit', function(e) {
      if (!confirm(this.dataset.confirm)) {
        e.preventDefault();
      }
    });
  });
});