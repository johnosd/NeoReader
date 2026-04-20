// Initialize Lucide icons
    lucide.createIcons();

    // Overlays logic
    function openModal(id) {
      document.getElementById(id).classList.add('is-open');
    }
    function closeModal(id) {
      document.getElementById(id).classList.remove('is-open');
    }
    function showToast() {
      const toast = document.getElementById('demo-toast');
      toast.classList.add('is-open');
      setTimeout(() => {
        toast.classList.remove('is-open');
      }, 4000);
    }