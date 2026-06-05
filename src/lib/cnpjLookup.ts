export type CnpjData = {
  nome: string;
  fantasia?: string;
  cnpj: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  telefone?: string;
  email?: string;
  inscricao_estadual?: string;
};

export async function fetchCnpj(cnpj: string): Promise<CnpjData | null> {
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length !== 14) return null;
  try {
    console.log("[CNPJ Lookup] Buscando CNPJ:", digits);
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
    console.log("[CNPJ Lookup] Status:", res.status);
    if (!res.ok) return null;
    const data = await res.json();
    console.log("[CNPJ Lookup] Dados:", data);
    return {
      nome: data.razao_social || data.nome || "",
      fantasia: data.fantasia || "",
      cnpj: data.cnpj || digits,
      logradouro: data.logradouro || "",
      numero: data.numero || "",
      complemento: data.complemento || "",
      bairro: data.bairro || "",
      municipio: data.municipio || "",
      uf: data.uf || "",
      cep: data.cep || "",
      telefone: data.telefone || "",
      email: data.email || "",
      inscricao_estadual: data.inscricoes_estaduais?.[0]?.inscricao_estadual || "",
    };
  } catch {
    return null;
  }
}
