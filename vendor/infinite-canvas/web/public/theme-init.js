try {
    var canvasThemeState = JSON.parse(localStorage.getItem("infinite-canvas:theme_store") || "{}");
    var canvasTheme = canvasThemeState.state && canvasThemeState.state.theme === "light" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", canvasTheme === "dark");
    document.documentElement.style.colorScheme = canvasTheme;
} catch (error) {
    // The application will use its default theme if storage is unavailable.
}
