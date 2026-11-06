import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { NeuronEditor } from '../features/editor/NeuronEditor';
import { NetworkTopology, initializeNetworkParameters } from '../core/nn-core';

function ControlledEditorHarness() {
  const [topology, setTopology] = useState<NetworkTopology>({
    inputs: [],
    hidden: [],
    outputs: [],
    links: [],
  });
  const params = initializeNetworkParameters(topology, 'deterministic', 42);

  return (
    <NeuronEditor
      locale="pt-BR"
      topology={topology}
      parameters={params}
      activation="relu"
      useBias={true}
      limits={{
        allowedInputs: ['dist_front', 'floor_light'],
        allowedOutputs: ['jump'],
        maxHiddenLayers: 2,
        maxHiddenNeurons: 2,
      }}
      onChangeTopology={setTopology}
    />
  );
}

describe('T4 NeuronEditor — Build 2->2->1 with Keyboard & Mouse and Export Expected JSON', () => {
  it('builds the 2->2->1 network using mouse and keyboard and matches SDD Section 5 JSON topology', () => {
    render(<ControlledEditorHarness />);

    // 1. Adiciona 2 entradas: dist_front e floor_light
    fireEvent.click(screen.getByTestId('toggle-input-dist_front'));
    fireEvent.click(screen.getByTestId('toggle-input-floor_light'));

    // 2. Adiciona 2 neurônios ocultos (h1 e h2) respeitando o limite maxHiddenNeurons=2
    const addH1Btn = screen.getByTestId('add-hidden-l1');
    fireEvent.click(addH1Btn);
    fireEvent.click(addH1Btn);
    expect(addH1Btn).toBeDisabled();

    // 3. Adiciona 1 saída: jump
    fireEvent.click(screen.getByTestId('toggle-output-jump'));

    // 4. Conecta cabos usando teclado (Enter/Espaço) e clique de mouse:
    // ["dist_front", "h1"] via teclado
    fireEvent.keyDown(screen.getByTestId('neuron-node-dist_front'), { key: 'Enter' });
    fireEvent.keyDown(screen.getByTestId('neuron-node-h1'), { key: 'Enter' });

    // ["floor_light", "h2"] via teclado (Espaço)
    fireEvent.keyDown(screen.getByTestId('neuron-node-floor_light'), { key: ' ' });
    fireEvent.keyDown(screen.getByTestId('neuron-node-h2'), { key: ' ' });

    // ["h1", "jump"] e ["h2", "jump"] via mouse
    fireEvent.click(screen.getByTestId('neuron-node-h1'));
    fireEvent.click(screen.getByTestId('neuron-node-jump'));

    fireEvent.click(screen.getByTestId('neuron-node-h2'));
    fireEvent.click(screen.getByTestId('neuron-node-jump'));

    const exportedJson = JSON.parse(
      screen.getByTestId('exported-topology-json').textContent || '{}',
    ) as NetworkTopology;

    expect(exportedJson).toEqual({
      inputs: ['dist_front', 'floor_light'],
      hidden: [
        [
          { id: 'h1', activation: 'relu' },
          { id: 'h2', activation: 'relu' },
        ],
      ],
      outputs: ['jump'],
      links: [
        ['dist_front', 'h1'],
        ['floor_light', 'h2'],
        ['h1', 'jump'],
        ['h2', 'jump'],
      ],
    });

    // Verifica inspeção em tempo real (RF-06) ao passar o mouse num neurônio
    fireEvent.mouseEnter(screen.getByTestId('neuron-node-h1'));
    expect(screen.getByTestId('inspector-weighted-sum')).toBeInTheDocument();
    expect(screen.getByTestId('inspector-activated-output')).toBeInTheDocument();
  });
});

