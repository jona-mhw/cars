# Neuro Drive

Simulación de neuroevolución: una población de autos aprende a conducir desde cero con
una red neuronal (perceptrón multicapa) y un algoritmo genético. No hay modelo
pre-entrenado; los agentes mejoran generación a generación a partir de sus propios choques.

Demo: https://jona-mhw.github.io/cars/

## Stack

- TypeScript, sin frameworks. Build con Vite.
- Render sobre Canvas API (la simulación y la visualización de la red).
- Red neuronal (MLP) y algoritmo genético implementados a mano, sin librerías de ML.
- El mejor "cerebro" de cada corrida se guarda en Local Storage.

## Cómo leer la simulación

Autos que aprenden:
- Azul translúcido: la población actual; cada uno con una red ligeramente distinta.
- Azul brillante: el líder de la generación (se ven sus sensores).
- Gris: agentes que chocaron y quedaron fuera.

Tráfico:
- Naranja/rojo: autos que solo avanzan recto; la red debe aprender a esquivarlos.

## Qué esperar

- Generaciones 1–3: casi todos chocan de inmediato. Es lo normal.
- Generaciones 5–10: algunos se mantienen más tiempo en pista.
- Generaciones 15+: esquivan los primeros obstáculos de forma consistente.
- Generaciones 50+: recorren buena parte del trazado.

Si tras muchas generaciones no hay mejora, reinicia la evolución para partir con redes
frescas, o sube la tasa de mutación a 0.3.

## Cómo funciona

El algoritmo genético usa selección por torneo, elitismo (los mejores pasan sin mutar),
crossover uniforme entre redes y mutación gaussiana (Box-Muller). La tasa de mutación es
adaptativa: sube cuando la población se estanca y baja cuando mejora. Los pesos se
inicializan con Xavier/Glorot, escalado para activación tanh.

## Desarrollo

```
npm install
npm run dev      # servidor local
npm run build    # build de producción
```

Proyecto de aprendizaje, partido del tutorial de neuroevolución de Radu
Mariescu-Istodor y extendido con el algoritmo genético descrito arriba.
