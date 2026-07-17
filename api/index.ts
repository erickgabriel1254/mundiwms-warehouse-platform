import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleApi } from '../server/http.js';

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return handleApi(req, res);
}
