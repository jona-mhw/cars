# Neuro Drive: Simulación de IA Conducción

Este proyecto es una demostración visual de **Aprendizaje Evolutivo** (Neuro-evolución). No verás una IA pre-entrenada; verás una población de agentes aprendiendo desde cero a través de sus propios errores.

## 🚀 Tecnologías Utilizadas
- **Lenguaje**: TypeScript
- **Entorno**: Vite + Vanilla JS (sin frameworks pesados para máxima performance)
- **Canvas API**: Renderizado personalizado de alta velocidad para la simulación y la red neuronal.
- **Red Neuronal (MLP)**: Un Perceptrón Multicapa implementado desde cero sin librerías externas.
- **Algoritmo Genético**: Selección y mutación para la evolución de los agentes.
- **Local Storage**: Se usa para "guardar el mejor cerebro" localmente en tu navegador.

## 🎨 ¿Qué significan los colores?

### Coches de IA (los que aprenden):
*   **Azul Claro Transparente**: Son la "población" actual. Cada uno tiene un cerebro ligeramente diferente.
*   **Azul Brillante con Brillo (el líder)**: Es el coche que ha llegado más lejos en esta generación. Sus sensores (rayos amarillos) son visibles.
*   **Gris**: Son agentes que han **chocado** (con los bordes o con un obstáculo) y han sido eliminados de la carrera.

### Obstáculos (tráfico):
*   **Naranja/Rojo**: Son los coches "tontos" que solo avanzan en línea recta. **La IA debe aprender a esquivarlos.**

## 🔄 ¿Qué comportamiento debo ver?

1.  **Generación 1-3**: Los coches salen disparados, la mayoría chocan inmediatamente contra los bordes o el primer obstáculo. Es **normal**.
2.  **Generación 5-10**: Empezarás a ver coches que logran mantenerse en la carretera por más tiempo.
3.  **Generación 15+**: Deberías ver coches que esquivan los primeros obstáculos de forma consistente.
4.  **Generación 50+**: La IA debería poder navegar una buena parte del recorrido.

> **Nota**: Si después de muchas generaciones no ves mejora, prueba presionar "Reiniciar Evolución" para empezar con cerebros aleatorios frescos, o aumentar la mutación a 0.3.

---
*Desarrollado como un ejercicio de aprendizaje automático visual.*
