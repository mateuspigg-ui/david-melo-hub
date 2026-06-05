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

async function fetchCep(cep: string): Promise<Partial<CnpjData> | null> {
  const digits = cep.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.erro) return null;
    return {
      logradouro: data.logradouro || "",
      bairro: data.bairro || "",
      municipio: data.localidade || "",
      uf: data.uf || "",
      cep: data.cep || "",
    };
  } catch {
    return null;
  }
}

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

    const result: CnpjData = {
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

    if (!result.logradouro && result.cep) {
      console.log("[CNPJ Lookup] Logradouro vazio, buscando CEP:", result.cep);
      const cepData = await fetchCep(result.cep);
      if (cepData) {
        console.log("[CNPJ Lookup] Dados do CEP:", cepData);
        result.logradouro = cepData.logradouro || "";
        result.bairro = cepData.bairro || "";
        result.municipio = cepData.municipio || "";
        result.uf = cepData.uf || "";
      }
    }

    return result;
  } catch {
    return null;
  }
}
