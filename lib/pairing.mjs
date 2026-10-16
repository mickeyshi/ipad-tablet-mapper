import QRCode from 'qrcode';

export async function pairingCodes(interfaces, port, token) {
  const addresses = [...new Set(Object.values(interfaces).flatMap(entries => entries || [])
    .filter(ip => ip.family === 'IPv4' && !ip.internal).map(ip => ip.address))];
  return Promise.all(addresses.map(async address => {
    const url = `http://${address}:${port}/#${token}`;
    return { address, url, qr: await QRCode.toDataURL(url, { width: 280, margin: 4, errorCorrectionLevel: 'M' }) };
  }));
}
