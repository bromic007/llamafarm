import { useQuery, useMutation } from '@tanstack/react-query'
import apiClient from '../api/client'

type ExampleSummary = {
  id: string
  slug?: string
  title: string
  description?: string
  primaryModel?: string
  tags: string[]
}

export function useExamples() {
  return useQuery<{ examples: ExampleSummary[] }>({
    queryKey: ['examples'],
    queryFn: async () => {
      const { data } = await apiClient.get('/examples')
      return data
    },
  })
}

export function useImportExampleProject() {
  return useMutation({
    mutationFn: async (payload: {
      exampleId: string
      namespace: string
      name: string
      process?: boolean
    }) => {
      const { exampleId, ...body } = payload
      const { data } = await apiClient.post(
        `/examples/${exampleId}/import-project`,
        body
      )
      return data as {
        project: string
        namespace: string
        datasets: string[]
        task_ids: string[]
      }
    },
  })
}

export function useImportExampleData() {
  return useMutation({
    mutationFn: async (payload: {
      exampleId: string
      namespace: string
      project: string
      include_strategies?: boolean
      process?: boolean
    }) => {
      const { exampleId, ...body } = payload
      const { data } = await apiClient.post(
        `/examples/${exampleId}/import-data`,
        body
      )
      return data as {
        project: string
        namespace: string
        datasets: string[]
        task_ids: string[]
      }
    },
  })
}
