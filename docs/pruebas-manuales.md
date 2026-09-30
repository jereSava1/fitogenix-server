# Pruebas manuales

Lo que se encuentra probando la app a mano, con su estado. Cada fila nueva lleva fecha y cómo se probó.

## Cómo probar en local

| Dónde | Qué hace falta |
|---|---|
| Server | `npm run dev` en `fitogenix-server` (el `.env` apunta al Supabase real: lo que se haga queda en producción) |
| Navegador (Expo web) | `CORS_ORIGINS=http://localhost:8081` en el `.env` del server; sin eso el navegador bloquea todo con `Failed to fetch` (H-03: sin lista, sin CORS). `EXPO_PUBLIC_BACKEND_URL=http://localhost:3000` en native |
| Teléfono | Un *development build* instalado (la app usa `expo-dev-client` y Google Sign-In nativo: Expo Go no alcanza). **Desde F-08 hace falta uno nuevo** (`expo-secure-store`, `expo-crypto` y `usesAppleSignIn`), la misma red Wi-Fi y `EXPO_PUBLIC_BACKEND_URL=http://<IP de la Mac>:3000` |
| Onboarding | `EXPO_PUBLIC_SKIP_ONBOARDING=1` en el `.env` de native lo saltea (solo en desarrollo) |

## Observaciones

| # | Fecha | Dónde | Qué pasa | Análisis | Estado |
|---|---|---|---|---|---|
| PM-01 | 2026-09-30 | Navegador | Guardados, historial y búsqueda fallan con `Failed to fetch` | CORS: el `.env` local del server no tenía `CORS_ORIGINS` | ✅ Resuelto con la variable (solo local) |
| PM-02 | 2026-09-30 | Navegador | Después de una búsqueda, algunas imágenes no cargan (`net::ERR…`) | La app muestra `imageUrl` directo desde el sitio de origen (D-49); algunos sitios bloquean que otra página use sus imágenes. Es el hosting propio de imágenes, diferido | Pendiente: [DT-04](deuda-tecnica.md) / L-10. Verificar en el teléfono si pasa igual |
| PM-03 | 2026-09-30 | Navegador, cámara de la computadora | No lee códigos de barras (antes sí) | Sin analizar: puede ser la cámara frontal (imagen espejada o sin foco) o un cambio en el lector web | A verificar en el teléfono; si allá anda, se analiza solo el caso web |
| PM-04 | 2026-09-30 | Inicio, "Productos analizados" | El nombre del producto se corta en la primera letra ("S…", "F…") | Error de diseño previo al refactor: la tarjeta deja al nombre una sola línea muy angosta | Pendiente (native, diseño) |
| PM-05 | 2026-09-30 | Navegador, onboarding | En los pasos "¿Qué querés evitar?" y "¿Cómo nos conociste?" los toques no marcan las opciones ("Todos los anteriores" sí) | En web, un espaciador vacío (`<View style={{ flex: 1 }} />`) queda encima de la lista y se come los clics; en "evitar" además las tarjetas se superponen. Previo a F-10 (solo diseño web; el onboarding es igual en el teléfono). Visto en la prueba de punta a punta de F-08 | A verificar en el teléfono |
