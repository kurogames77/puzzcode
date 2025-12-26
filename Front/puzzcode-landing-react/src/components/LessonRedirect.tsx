import { Navigate, useParams, useSearchParams } from 'react-router-dom'

export default function LessonRedirect() {
  const { courseId } = useParams<{ courseId: string }>()
  const [searchParams] = useSearchParams()
  
  // Preserve all query parameters
  const queryString = searchParams.toString()
  const newPath = `/lesson/${courseId}${queryString ? `?${queryString}` : ''}`
  
  return <Navigate to={newPath} replace />
}

