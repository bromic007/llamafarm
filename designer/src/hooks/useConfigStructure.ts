import { useMemo, useRef } from 'react'
import yaml from 'yaml'
import type { TOCNode, ConfigStructureResult } from '../types/config-toc'

/**
 * Hook to parse YAML config and extract hierarchical structure for TOC
 * Uses JSON Pointers (RFC 6902) for section identification
 */
export function useConfigStructure(
  yamlContent: string,
  shouldUpdate: boolean = true
): ConfigStructureResult {
  const lastResultRef = useRef<ConfigStructureResult>({
    nodes: [],
    success: true,
  })

  return useMemo(() => {
    if (!shouldUpdate) {
      return lastResultRef.current
    }

    if (!yamlContent.trim()) {
      const result: ConfigStructureResult = {
        nodes: [],
        success: false,
        error: 'Empty content',
      }
      lastResultRef.current = result
      return result
    }

    try {
      // Parse YAML with line counter to track positions
      const doc = yaml.parseDocument(yamlContent, {
        lineCounter: new yaml.LineCounter(),
      })
      const config = doc.toJS()

      if (!config || typeof config !== 'object') {
        return { nodes: [], success: false, error: 'Invalid config format' }
      }

      const nodes: TOCNode[] = []

      // Helper to get line range for a path
      const getLineRange = (
        path: (string | number)[]
      ): { start: number; end: number } => {
        try {
          const node = doc.getIn(path, true) as any
          const lineCounter = (doc as any).lineCounter
          if (node && node.range && lineCounter) {
            const startPos = lineCounter.linePos(node.range[0])
            const endPos = lineCounter.linePos(node.range[1])
            // linePos returns 1-indexed line numbers
            return { start: startPos.line, end: endPos.line }
          }
        } catch (err) {
          // Silently fall back
        }
        return { start: 1, end: 1 }
      }

      // Helper to find line number by searching for a key
      const findLineByKey = (key: string, startAfter: number = 0): number => {
        const lines = yamlContent.split('\n')
        for (let i = startAfter; i < lines.length; i++) {
          const line = lines[i]
          // Look for the key at the start of the line (accounting for indentation)
          if (
            line.trim().startsWith(key + ':') ||
            line.trim().startsWith('- ' + key + ':')
          ) {
            return i + 1 // Return 1-indexed line number
          }
        }
        return startAfter + 1
      }

      // 1. Overview section (version, name, namespace)
      const overviewRange = getLineRange([])
      nodes.push({
        id: 'overview',
        label: 'Overview',
        jsonPointer: '/',
        lineStart: 1,
        lineEnd: Math.max(3, overviewRange.start + 2),
        level: 0,
        isCollapsible: false,
        iconType: 'overview',
      })

      // 2. Prompts section
      if (config.prompts && Array.isArray(config.prompts)) {
        const promptsRange = getLineRange(['prompts'])
        const promptsLine =
          promptsRange.start === 1
            ? findLineByKey('prompts')
            : promptsRange.start
        const promptChildren: TOCNode[] = []

        let lastPromptLine = promptsLine
        config.prompts.forEach((prompt: any, index: number) => {
          const promptRange = getLineRange(['prompts', index])
          let promptLine = promptRange.start

          // Fallback: search for prompt name after the last prompt
          if (promptLine === 1 && prompt.name) {
            promptLine = findLineByKey('name', Math.max(0, lastPromptLine - 1))
            lastPromptLine = promptLine + 5 // Estimate spacing
          }

          promptChildren.push({
            id: `prompt-${index}`,
            label: prompt.name || `Prompt ${index + 1}`,
            jsonPointer: `/prompts/${index}`,
            lineStart: promptLine,
            lineEnd: promptRange.end > 1 ? promptRange.end : promptLine + 10,
            level: 1,
            isCollapsible: false,
            iconType: 'prompt',
          })
        })

        if (promptChildren.length > 0) {
          nodes.push({
            id: 'prompts',
            label: 'Prompts',
            jsonPointer: '/prompts',
            lineStart: promptsLine,
            lineEnd:
              promptsRange.end > 1
                ? promptsRange.end
                : promptChildren[promptChildren.length - 1]?.lineEnd ||
                  promptsLine + 20,
            level: 0,
            isCollapsible: true,
            children: promptChildren,
            iconType: 'prompt',
          })
        }
      }

      // 3. RAG section with databases and data processing strategies
      if (config.rag && typeof config.rag === 'object') {
        const ragRange = getLineRange(['rag'])
        const ragLine =
          ragRange.start === 1 ? findLineByKey('rag') : ragRange.start
        const ragChildren: TOCNode[] = []

        // Databases subsection
        if (config.rag.databases && Array.isArray(config.rag.databases)) {
          const databasesRange = getLineRange(['rag', 'databases'])
          const databasesLine =
            databasesRange.start === 1
              ? findLineByKey('databases', Math.max(0, ragLine - 1))
              : databasesRange.start
          const databaseChildren: TOCNode[] = []

          let lastDbLine = databasesLine
          config.rag.databases.forEach((db: any, index: number) => {
            const dbRange = getLineRange(['rag', 'databases', index])
            let dbLine = dbRange.start

            // Fallback: search for database name
            if (dbLine === 1 && db.name) {
              dbLine = findLineByKey('name', Math.max(0, lastDbLine - 1))
              lastDbLine = dbLine + 10
            }

            databaseChildren.push({
              id: `database-${index}`,
              label: db.name || `Database ${index + 1}`,
              jsonPointer: `/rag/databases/${index}`,
              lineStart: dbLine,
              lineEnd: dbRange.end > 1 ? dbRange.end : dbLine + 15,
              level: 2,
              isCollapsible: false,
              iconType: 'database',
            })
          })

          if (databaseChildren.length > 0) {
            ragChildren.push({
              id: 'databases',
              label: 'Databases',
              jsonPointer: '/rag/databases',
              lineStart: databasesLine,
              lineEnd:
                databasesRange.end > 1
                  ? databasesRange.end
                  : databaseChildren[databaseChildren.length - 1]?.lineEnd ||
                    databasesLine + 20,
              level: 1,
              isCollapsible: true,
              children: databaseChildren,
              iconType: 'database',
            })
          }
        }

        // Data processing strategies subsection
        if (
          config.rag.data_processing_strategies &&
          Array.isArray(config.rag.data_processing_strategies)
        ) {
          const strategiesRange = getLineRange([
            'rag',
            'data_processing_strategies',
          ])
          const strategiesLine =
            strategiesRange.start === 1
              ? findLineByKey(
                  'data_processing_strategies',
                  Math.max(0, ragLine - 1)
                )
              : strategiesRange.start
          const strategyChildren: TOCNode[] = []

          let lastStrategyLine = strategiesLine
          config.rag.data_processing_strategies.forEach(
            (strategy: any, index: number) => {
              const strategyRange = getLineRange([
                'rag',
                'data_processing_strategies',
                index,
              ])
              let strategyLine = strategyRange.start

              // Fallback: search for strategy name
              if (strategyLine === 1 && strategy.name) {
                strategyLine = findLineByKey(
                  'name',
                  Math.max(0, lastStrategyLine - 1)
                )
                lastStrategyLine = strategyLine + 15
              }

              strategyChildren.push({
                id: `strategy-${index}`,
                label: strategy.name || `Strategy ${index + 1}`,
                jsonPointer: `/rag/data_processing_strategies/${index}`,
                lineStart: strategyLine,
                lineEnd:
                  strategyRange.end > 1 ? strategyRange.end : strategyLine + 20,
                level: 2,
                isCollapsible: false,
                iconType: 'strategy',
              })
            }
          )

          if (strategyChildren.length > 0) {
            ragChildren.push({
              id: 'data_processing_strategies',
              label: 'Data processing strategies',
              jsonPointer: '/rag/data_processing_strategies',
              lineStart: strategiesLine,
              lineEnd:
                strategiesRange.end > 1
                  ? strategiesRange.end
                  : strategyChildren[strategyChildren.length - 1]?.lineEnd ||
                    strategiesLine + 30,
              level: 1,
              isCollapsible: true,
              children: strategyChildren,
              iconType: 'strategy',
            })
          }
        }

        if (ragChildren.length > 0) {
          nodes.push({
            id: 'rag',
            label: 'RAG',
            jsonPointer: '/rag',
            lineStart: ragLine,
            lineEnd:
              ragRange.end > 1
                ? ragRange.end
                : ragChildren[ragChildren.length - 1]?.lineEnd || ragLine + 50,
            level: 0,
            isCollapsible: true,
            children: ragChildren,
            iconType: 'database',
          })
        }
      }

      // 4. Datasets section
      if (config.datasets && Array.isArray(config.datasets)) {
        const datasetsRange = getLineRange(['datasets'])
        const datasetsLine =
          datasetsRange.start === 1
            ? findLineByKey('datasets')
            : datasetsRange.start
        const datasetChildren: TOCNode[] = []

        // Always create children for each dataset
        let lastFoundLine = datasetsLine
        config.datasets.forEach((dataset: any, index: number) => {
          const datasetRange = getLineRange(['datasets', index])
          let datasetLine = datasetRange.start
          let datasetEndLine = datasetRange.end

          // If parser range is invalid or suspicious, search for the dataset by name
          if (
            datasetRange.start <= 1 ||
            datasetRange.end <= datasetRange.start ||
            (dataset.name && datasetRange.start < lastFoundLine)
          ) {
            // Search for "- name: {dataset_name}" in the YAML
            if (dataset.name) {
              const lines = yamlContent.split('\n')
              for (
                let i = Math.max(0, lastFoundLine - 1);
                i < lines.length;
                i++
              ) {
                const line = lines[i].trim()
                // Look for the list item with this dataset's name
                if (
                  (line.startsWith('- name:') || line.startsWith('name:')) &&
                  line.includes(dataset.name)
                ) {
                  datasetLine = i + 1
                  datasetEndLine = Math.min(i + 6, lines.length)
                  lastFoundLine = datasetLine
                  break
                }
              }
            }

            // If still not found, use estimate
            if (datasetLine <= 1) {
              datasetLine = datasetsLine + 2 + index * 5
              datasetEndLine = datasetLine + 4
            }
          } else {
            lastFoundLine = datasetLine
          }

          datasetChildren.push({
            id: `dataset-${index}`,
            label: dataset.name || `Dataset ${index + 1}`,
            jsonPointer: `/datasets/${index}`,
            lineStart: datasetLine,
            lineEnd: datasetEndLine,
            level: 1,
            isCollapsible: false,
            iconType: 'dataset',
          })
        })

        nodes.push({
          id: 'datasets',
          label: `Datasets${config.datasets.length > 0 ? ` (${config.datasets.length})` : ''}`,
          jsonPointer: '/datasets',
          lineStart: datasetsLine,
          lineEnd:
            datasetsRange.end > 1
              ? datasetsRange.end
              : datasetChildren.length > 0
                ? datasetChildren[datasetChildren.length - 1].lineEnd + 1
                : datasetsLine + 20,
          level: 0,
          isCollapsible: true,
          children: datasetChildren,
          iconType: 'dataset',
        })
      }

      // 5. Runtime section
      if (config.runtime && typeof config.runtime === 'object') {
        const runtimeRange = getLineRange(['runtime'])
        const runtimeLine =
          runtimeRange.start === 1
            ? findLineByKey('runtime')
            : runtimeRange.start
        const modelChildren: TOCNode[] = []

        // Check if there are models to show as children
        if (
          config.runtime.models &&
          Array.isArray(config.runtime.models) &&
          config.runtime.models.length > 0
        ) {
          const modelsRange = getLineRange(['runtime', 'models'])
          const modelsLine =
            modelsRange.start > 1 ? modelsRange.start : runtimeLine + 2

          // Always create children for each model
          let lastFoundModelLine = modelsLine
          config.runtime.models.forEach((model: any, index: number) => {
            const modelRange = getLineRange(['runtime', 'models', index])
            let modelLine = modelRange.start
            let modelEndLine = modelRange.end

            // If parser range is invalid or suspicious, search for the model by name
            if (
              modelRange.start <= 1 ||
              modelRange.end <= modelRange.start ||
              (model.name && modelRange.start < lastFoundModelLine)
            ) {
              // Search for "- name: {model_name}" in the YAML
              if (model.name) {
                const lines = yamlContent.split('\n')
                for (
                  let i = Math.max(0, lastFoundModelLine - 1);
                  i < lines.length;
                  i++
                ) {
                  const line = lines[i].trim()
                  // Look for the list item with this model's name
                  if (
                    (line.startsWith('- name:') || line.startsWith('name:')) &&
                    line.includes(model.name)
                  ) {
                    modelLine = i + 1
                    modelEndLine = Math.min(i + 9, lines.length)
                    lastFoundModelLine = modelLine
                    break
                  }
                }
              }

              // If still not found, use estimate
              if (modelLine <= 1) {
                modelLine = modelsLine + 1 + index * 8
                modelEndLine = modelLine + 7
              }
            } else {
              lastFoundModelLine = modelLine
            }

            modelChildren.push({
              id: `model-${index}`,
              label: model.name || `Model ${index + 1}`,
              jsonPointer: `/runtime/models/${index}`,
              lineStart: modelLine,
              lineEnd: modelEndLine,
              level: 1,
              isCollapsible: false,
              iconType: 'runtime',
            })
          })
        }

        const modelCount = config.runtime.models?.length || 0
        const label =
          modelCount > 0 ? `Runtime (${modelCount} models)` : 'Runtime'

        nodes.push({
          id: 'runtime',
          label,
          jsonPointer: '/runtime',
          lineStart: runtimeLine,
          lineEnd:
            runtimeRange.end > 1
              ? runtimeRange.end
              : modelChildren.length > 0
                ? modelChildren[modelChildren.length - 1].lineEnd + 1
                : runtimeLine + 30,
          level: 0,
          isCollapsible: modelChildren.length > 0,
          children: modelChildren.length > 0 ? modelChildren : undefined,
          iconType: 'runtime',
        })
      }

      // 6. MCP section (if present)
      if (config.mcp && typeof config.mcp === 'object') {
        const mcpRange = getLineRange(['mcp'])
        const mcpLine =
          mcpRange.start === 1 ? findLineByKey('mcp') : mcpRange.start
        const serverCount = config.mcp.servers?.length || 0
        const label = serverCount > 0 ? `MCP (${serverCount} servers)` : 'MCP'

        nodes.push({
          id: 'mcp',
          label,
          jsonPointer: '/mcp',
          lineStart: mcpLine,
          lineEnd: mcpRange.end > 1 ? mcpRange.end : mcpLine + 20,
          level: 0,
          isCollapsible: false,
          iconType: 'mcp',
        })
      }

      const result: ConfigStructureResult = { nodes, success: true }
      lastResultRef.current = result
      return result
    } catch (error) {
      console.error('Failed to parse config structure:', error)
      const result: ConfigStructureResult = {
        nodes: [],
        success: false,
        error: error instanceof Error ? error.message : 'Parse error',
      }
      lastResultRef.current = result
      return result
    }
  }, [yamlContent, shouldUpdate])
}
