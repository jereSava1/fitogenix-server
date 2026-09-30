# Checklist manual de accesibilidad (F-13, RNF-U11)

Lo que los tests de native no pueden ver: lectores de pantalla reales, letra grande en el dispositivo y "reducir movimiento" en animaciones que no corren en el entorno de tests. Se hace en un iPhone (VoiceOver) y en un Android (TalkBack), con la app compilada de `fitogenix/refactor-cleanup` de native.

Anotá en cada fila ✅ o lo que falló (pantalla + control + qué dijo o hizo).

## 1. Lector de pantalla (VoiceOver y TalkBack)

| # | Pantalla | Qué hacer | Qué tiene que pasar |
|---|---|---|---|
| 1 | Barra de tabs | Recorrer los 5 íconos | Dice "Inicio", "Historial", "Escanear", "Guía", "Perfil", cada uno como pestaña, y cuál está seleccionada |
| 2 | Inicio | Escribir algo y llegar al botón de la lupa | Dice "Buscar, botón" (atenuado si el campo está vacío) |
| 3 | Escanear | Con la cámara abierta, recorrer la barra de arriba | "Cerrar la cámara" y "Encender la linterna" / "Apagar la linterna" según el estado |
| 4 | Resultado | Recorrer el encabezado | "Volver", "Guardar producto" (o "Quitar de guardados") y "Compartir, atenuado" |
| 5 | Resultado, sin sesión | Tocar "Guardar producto" | Aparece la invitación a crear cuenta y el lector la lee completa |
| 6 | Resultado | Abrir "Nutrición" y demás secciones desplegables | Dice si está expandida o contraída |
| 7 | Historial, Recientes | Sobre una fila, abrir las acciones (VoiceOver: rotor "Acciones"; TalkBack: menú de acciones) | Aparece "Borrar del historial" y, al elegirla, la fila se va |
| 8 | Historial, Guardados | Ídem | Aparece "Quitar de guardados" |
| 9 | Welcome, registro y cambio de contraseña | Llegar al ojito del campo de contraseña | "Mostrar la contraseña" / "Ocultar la contraseña" (y "…la confirmación" en el segundo campo) |
| 10 | Pantallas con flecha para atrás (ayuda, feedback, datos personales, registro, recuperar contraseña) | Llegar a la flecha | Dice "Volver, botón" |
| 11 | Onboarding | Llegar a la flecha de arriba | Dice "Volver" |
| 12 | Perfil | Recorrer los íconos de redes | "Fitogenix en Instagram", "…en X", "…en YouTube", como enlaces |
| 13 | Modales de "Cómo puntuamos" y "Reportar problema" | Recorrer hasta el fondo oscuro | Dice "Cerrar" y al activarlo se cierra |

## 2. Letra grande (200 %)

iOS: Ajustes → Accesibilidad → Pantalla y tamaño del texto → Texto más grande, al máximo con "Tamaños más grandes". Android: Ajustes → Pantalla → Tamaño de fuente al máximo.

| # | Pantalla | Qué tiene que pasar |
|---|---|---|
| 14 | Inicio (P-07) | Los nombres de los últimos escaneos se leen en hasta 3 líneas; nada se superpone |
| 15 | Escanear (P-08) | Los mensajes (permiso, fuera de catálogo, error) se leen completos |
| 16 | Resultado (P-09) | Nombre, marca, puntaje, ingredientes y nutrición se leen completos; se puede scrollear hasta el final |
| 17 | Historial (P-10) | Los nombres se leen en hasta 3 líneas; los botones de Recientes / Guardados no se cortan |

## 3. Reducir movimiento

iOS: Ajustes → Accesibilidad → Movimiento → Reducir movimiento. Android: Ajustes → Accesibilidad → Quitar animaciones.

| # | Dónde | Qué tiene que pasar |
|---|---|---|
| 18 | Cambiar de tab | La pantalla aparece sin deslizarse; el indicador de la barra salta sin rebote |
| 19 | Escanear | La línea de escaneo queda quieta en el medio del marco |
| 20 | Resultado | El dial muestra el puntaje sin llenarse de a poco; guardar no hace rebotar el ícono; las secciones se abren sin animación |
| 21 | Modales ("Cómo puntuamos", "Reportar problema", selector de país en el registro) | Aparecen sin deslizarse desde abajo |

## Fuera de F-13

El contraste AA (4,5:1) que pide RNF-U11 no se revisó en F-13: queda pendiente de una pasada de diseño.
