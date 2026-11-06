import type { Edge, Node } from '@xyflow/react';
import {
  ActivationFunction,
  ForwardPassResult,
  HiddenNeuron,
  NetworkParameters,
  NetworkTopology,
  countHiddenNeurons,
  getLinkKey,
} from '../../core/nn-core';

export const EDITOR_FEATURE_ID = 'editor';

export interface EditorLimits {
  allowedInputs: string[];
  allowedOutputs: string[];
  maxHiddenLayers: number;
  maxHiddenNeurons: number;
  maxNeuronsPerLayer?: number;
}

export function getNodeLayerRank(topology: NetworkTopology, nodeId: string): number {
  if (topology.inputs.includes(nodeId)) return 0;
  for (let l = 0; l < topology.hidden.length; l++) {
    if (topology.hidden[l].some((n) => n.id === nodeId)) {
      return l + 1;
    }
  }
  if (topology.outputs.includes(nodeId)) {
    return topology.hidden.length + 1;
  }
  return -1;
}

export function toggleInputSensor(
  topology: NetworkTopology,
  sensorId: string,
  limits: EditorLimits,
): NetworkTopology {
  if (!limits.allowedInputs.includes(sensorId)) {
    return topology;
  }
  const exists = topology.inputs.includes(sensorId);
  if (exists) {
    return {
      ...topology,
      inputs: topology.inputs.filter((id) => id !== sensorId),
      links: topology.links.filter(([from, to]) => from !== sensorId && to !== sensorId),
    };
  }
  if (topology.inputs.length >= 4) {
    return topology;
  }
  return {
    ...topology,
    inputs: [...topology.inputs, sensorId],
  };
}

export function toggleOutputAction(
  topology: NetworkTopology,
  actionId: string,
  limits: EditorLimits,
): NetworkTopology {
  if (!limits.allowedOutputs.includes(actionId)) {
    return topology;
  }
  const exists = topology.outputs.includes(actionId);
  if (exists) {
    return {
      ...topology,
      outputs: topology.outputs.filter((id) => id !== actionId),
      links: topology.links.filter(([from, to]) => from !== actionId && to !== actionId),
    };
  }
  if (topology.outputs.length >= 3) {
    return topology;
  }
  return {
    ...topology,
    outputs: [...topology.outputs, actionId],
  };
}

export function addHiddenNeuron(
  topology: NetworkTopology,
  layerIndex: number,
  activation: ActivationFunction,
  limits: EditorLimits,
): NetworkTopology {
  if (layerIndex < 0 || layerIndex >= Math.min(2, limits.maxHiddenLayers)) {
    return topology;
  }
  const totalHidden = countHiddenNeurons(topology);
  if (totalHidden >= limits.maxHiddenNeurons) {
    return topology;
  }

  const nextHidden: HiddenNeuron[][] = topology.hidden.map((layer) => [...layer]);
  while (nextHidden.length <= layerIndex) {
    nextHidden.push([]);
  }

  const maxPerLayer = limits.maxNeuronsPerLayer ?? 6;
  if (nextHidden[layerIndex].length >= maxPerLayer) {
    return topology;
  }

  const existingIds = new Set<string>();
  nextHidden.forEach((layer) => layer.forEach((n) => existingIds.add(n.id)));

  let idx = 1;
  while (existingIds.has(`h${idx}`)) {
    idx += 1;
  }

  nextHidden[layerIndex].push({
    id: `h${idx}`,
    activation,
  });

  return {
    ...topology,
    hidden: nextHidden,
  };
}

export function removeHiddenNeuron(topology: NetworkTopology, neuronId: string): NetworkTopology {
  const nextHidden = topology.hidden
    .map((layer) => layer.filter((n) => n.id !== neuronId))
    .filter((layer) => layer.length > 0);

  return {
    ...topology,
    hidden: nextHidden,
    links: topology.links.filter(([from, to]) => from !== neuronId && to !== neuronId),
  };
}

export function toggleConnectionLink(
  topology: NetworkTopology,
  fromId: string,
  toId: string,
): NetworkTopology {
  if (fromId === toId) return topology;
  const fromRank = getNodeLayerRank(topology, fromId);
  const toRank = getNodeLayerRank(topology, toId);
  if (fromRank === -1 || toRank === -1) return topology;

  const actualFrom = fromRank < toRank ? fromId : toRank < fromRank ? toId : null;
  const actualTo = fromRank < toRank ? toId : toRank < fromRank ? fromId : null;
  if (!actualFrom || !actualTo) return topology;

  const exists = topology.links.some(([f, t]) => f === actualFrom && t === actualTo);
  if (exists) {
    return {
      ...topology,
      links: topology.links.filter(([f, t]) => !(f === actualFrom && t === actualTo)),
    };
  }

  return {
    ...topology,
    links: [...topology.links, [actualFrom, actualTo]],
  };
}

export function autoConnectLayers(topology: NetworkTopology): NetworkTopology {
  const layers: string[][] = [];
  if (topology.inputs.length > 0) {
    layers.push([...topology.inputs]);
  }
  for (const hLayer of topology.hidden) {
    if (hLayer.length > 0) {
      layers.push(hLayer.map((n) => n.id));
    }
  }
  if (topology.outputs.length > 0) {
    layers.push([...topology.outputs]);
  }

  const links: [string, string][] = [];
  for (let i = 0; i < layers.length - 1; i++) {
    for (const fromId of layers[i]) {
      for (const toId of layers[i + 1]) {
        links.push([fromId, toId]);
      }
    }
  }

  return {
    ...topology,
    links,
  };
}

/**
 * Converte a topologia e parâmetros em nós e arestas compatíveis com @xyflow/react.
 */
export function buildReactFlowElements(
  topology: NetworkTopology,
  params: NetworkParameters,
  forwardResult: ForwardPassResult,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const columns: { id: string; kind: 'input' | 'hidden' | 'output' }[][] = [
    topology.inputs.map((id) => ({ id, kind: 'input' as const })),
    ...topology.hidden.map((layer) =>
      layer.map((n) => ({ id: n.id, kind: 'hidden' as const })),
    ),
    topology.outputs.map((id) => ({ id, kind: 'output' as const })),
  ].filter((col) => col.length > 0);

  columns.forEach((col, colIdx) => {
    const x = 90 + colIdx * 230;
    col.forEach((item, rowIdx) => {
      const y = 60 + rowIdx * 90;
      const state = forwardResult.neurons[item.id];
      nodes.push({
        id: item.id,
        position: { x, y },
        data: {
          label: item.id,
          kind: item.kind,
          weightedSum: state?.weightedSum ?? 0,
          output: state?.output ?? 0,
          activation: state?.activation ?? 'linear',
        },
      });
    });
  });

  topology.links.forEach(([from, to]) => {
    const key = getLinkKey(from, to);
    const weight = params.linkWeights[key] ?? 0.5;
    const isPositive = weight >= 0;
    edges.push({
      id: key,
      source: from,
      target: to,
      label: `${isPositive ? '+' : '−'}${Math.abs(weight).toFixed(2)}`,
      animated: true,
      style: {
        stroke: isPositive ? '#38bdf8' : '#fb923c',
        strokeWidth: 2 + Math.min(6, Math.abs(weight) * 2.2),
        strokeDasharray: isPositive ? undefined : '6 4',
      },
    });
  });

  return { nodes, edges };
}
