import { useEffect, useState } from "react";
export function navigate(path) {
  window.location.hash = path;
}
export function useRoute() {
  const [route, setRoute] = useState(
    () => window.location.hash.slice(1) || "/projects",
  );
  useEffect(() => {
    const changed = () =>
      setRoute(window.location.hash.slice(1) || "/projects");
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  return route;
}
