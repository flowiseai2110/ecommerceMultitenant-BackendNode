export function apiResponse(res, {
  status = 200,
  type = "SUCCESS",
  code,
  data = null
}) {
  return res.status(status).json({
    status,
    type,
    code,
    data
  });
}

