(async function () {
  const views = [
    "home.html",
    "auth.html",
    "admin.html",
    "customer.html",
    "modals.html"
  ];
  const loader = document.querySelector("#page-loader");

  function showError(error) {
    loader.classList.add("load-error");
    loader.textContent = `No se pudieron cargar las páginas del sitio: ${error.message}. Abre el frontend con Live Server y vuelve a intentar.`;
  }

  function loadScript(source) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = source;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`No se pudo cargar ${source}`));
      document.body.append(script);
    });
  }

  try {
    const fragments = await Promise.all(views.map(async file => {
      const response = await fetch(`partials/${file}`);
      if (!response.ok) throw new Error(`${file} respondió HTTP ${response.status}`);
      return response.text();
    }));
    document.querySelector("#site-views").innerHTML = fragments.join("\n");
    document.querySelectorAll("#landing-view, #auth-view, #app-view, #customer-view")
      .forEach(view => view.classList.add("hidden"));
    await loadScript("js/config.js");
    await loadScript("js/api.js");
    await loadScript("js/app.js");
  } catch (error) {
    console.error(error);
    showError(error);
  }
})();
