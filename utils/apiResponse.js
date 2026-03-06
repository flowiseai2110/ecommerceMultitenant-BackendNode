export function apiResponse(res, {
  status = 200,
  type = "SUCCESS",
  code,
  data = null,
  meta = undefined
}) {
  const body = { status, type, code, data };
  if (meta !== undefined) body.meta = meta;
  return res.status(status).json(body);
}

