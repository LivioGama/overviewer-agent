import { FastifyReply, FastifyRequest } from 'fastify'
import { githubService } from '../services/github.js'

export const authenticateGitHubApp = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const authHeader = request.headers.authorization
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Missing or invalid authorization header' })
  }
  
  const token = authHeader.substring(7)
  
  try {
    const jwt = githubService.createJWT()
    if (token !== jwt) {
      return reply.code(401).send({ error: 'Invalid token' })
    }
  } catch (error) {
    return reply.code(401).send({ error: 'Token validation failed' })
  }
}

export const authenticateInstallation = async (
  request: FastifyRequest<{ Params: { installationId: string } }>,
  reply: FastifyReply
) => {
  const installationId = parseInt(request.params.installationId, 10)
  
  if (isNaN(installationId)) {
    return reply.code(400).send({ error: 'Invalid installation ID' })
  }
  
  try {
    await githubService.createInstallationToken(installationId)
    request.installationId = installationId
  } catch (error) {
    return reply.code(404).send({ error: 'Installation not found or invalid' })
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    installationId?: number
  }
}


