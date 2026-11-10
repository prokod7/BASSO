/**
 * Ruas com bairro conhecido em Ribeirão Pires e Rio Grande da Serra (diretório enviado pela
 * Basso: Correios, Lei Municipal 2.307/2019 de RGS e diretórios cartográficos). Só entram ruas
 * com bairro claro; ruas que existem nas duas cidades ficam de fora quando o bairro é incerto.
 * Formato: "Bairro|Cidade": "rua; rua; ...".
 */
const RP = "Ribeirão Pires";
const RGS = "Rio Grande da Serra";

export const STREET_DISTRICTS: Array<[string, string, string]> = [
  [`Centro`, RP, `Avenida Prefeito Valdírio Prisco; Rua Padre Marcos Simoni; Rua Alfredo Andreolli; Rua Esperança Arnoni; Rua Presidente Kennedy; Rua Afonso Zampol; Rua Domingos Balzani; Rua Domingos Benvenuto; Rua Capitão José Gallo; Rua Agostinho Pereira de Figueiredo; Rua Baptista Lion; Rua Miguel Prisco; Rua Leonardo Mecca; Travessa Gilberto Pereira de Figueiredo; Rua Felipe Sabbag; Praça Miguel Rimaik; Rua Domingos Mejias Morgado; Rua Stella Bruna Cecchi Nardelli; Rua Fioravante Zampol; Rua Imigrantes; Rua Boa Vista; Rua Doutor João Batista Rocha; Rua do Comércio; Rua Doutor Felício Laurito; Rua Euclides da Cunha; Rua Afrânio Peixoto; Praça do Centro; Rua João Domingues de Oliveira; Rua José Xavier de Barros; Rua Hugo Remígio Zampol; Rua Maria Cristina; Rua Estados Unidos; Rua Raphael Darriga; Avenida Francisco Monteiro; Avenida Fortuna; Rua Doutor Ayrton Jairo França; Praça Sabará; Rua José Elias Chiedde; Rua Palmar; Rua Doutor Yutaka Ishihara; Rua Santa Cruz; Rua Vergílio Gallo; Rua Giácomo Sortino; Rua Maria Tereza Dianda; Rua Cláudio Maurício Macciotta; Rua Pedro Mansueto Bechelli; Rua Ricardo Cecchi; Rua Sixto Pelegrini; Rua Primo Pelegrine; Rua Giácomo Bressan; Rua Carlos Rohn; Rua José Laurito; Rua Joaquim Moreno; Rua Gustavo Rohn; Rua Irineu Sortino; Rua Zulmiro Della Ricca; Rua João Gallo; Rua Oscar Tolentino Leal; Rua Águida Tori Sortino; Rua Eugênio Gallo; Rua Rômulo Lorenzone; Rua Albina Milani Gallo; Rua Massimina Bernardi Gallo; Rua Alda Prisco; Rua Rodolfo Gillardi; Rua Aquilino de Almeida; Rua Ângelo Versali; Rua Bélgica; Rua Rosimeire Martins Ipólito; Rua Espanha; Rua Itália; Rua Antônio Luiz Tavoglieri; Travessa Apa; Travessa Copa; Rua Gustavo Fagundes de Lima; Rua Formosa; Rua Renato Andreoli; Rua Ana Maria Rodriguez Fernandez de Lima; Rua da Glória; Rua Monte Castelo; Rua Paissandu; Rua Mariana Angeliniades de Oliveira; Rua João Ugliengo`],
  [`Pastoril`, RP, `Rua Diamantino de Oliveira; Rua Martha de Cândido; Rua Conde de Sarzedas; Rua Doutor Virgílio Gola; Rua Luiz Tolezano; Rua João Duarte; Rua Luiza Bertoldo Arruda; Rua Luiz Boaventura; Rua Joaquim Xavier de Barros; Rua José Pinto Novaes Júnior; Avenida Kaethe Richers; Rua Frederico Bressan; Rua Antônio Figueiredo Filho; Rua Ângelo Maziero`],
  [`Aliança`, RP, `Rua Firmino Gonçalves Pereira; Rua México; Rua João Belotti; Rua Lírio Caruso; Rua Professor Renato Andreghetto; Rua das Rosas; Rua das Amoras; Rua Emaculada; Rua das Pitangas; Rua Juvaneide Rodrigues`],
  [`Colônia`, RP, `Rua Dom Pedro I; Rua Doutor Afonso Rangel de Carvalho; Rua Professor Sebastião F. de Queiroz`],
  [`Jardim Colonial`, RP, `Rua Braúna`],
  [`Vila Aparecida`, RP, `Rua Cezarina Bragatti Cipriano; Rua Anastácio de Lima`],
  [`Vila Nova Suíssa Santista`, RP, `Rua João Soleno; Rua Eldorado`],
  [`Bocaina`, RP, `Avenida Humberto de Campos`],
  [`Quarta Divisão`, RP, `Rua Doutor João Batista Fortes; Estrada de Sapopemba; Avenida Miro Attílio Peduzzi`],
  [`Pouso Alegre`, RP, `Rua Yara; Rua Bomerang; Rua Maquiru; Rua Jandaia`],
  [`Jardim Alvorada`, RP, `Rua Alemanha; Rua Áustria`],
  [`Jardim Boa Sorte`, RP, `Rua Archimedes Correa de Almeida`],
  [`Jardim Guanabara`, RP, `Rua Albion; Rua Antônio Fortes; Rua Aspásia`],
  [`Jardim Valentina`, RP, `Rua Ana Lacivita Amaral`],
  [`Setor Francês`, RP, `Rua Auverne`],
  [`Sítio Taquaral`, RP, `Rua Arquimedes`],
  [`Vila Belmiro`, RP, `Rua Amapá`],
  [`Vila Gomes`, RP, `Rua Aladim; Rua Alvorada; Rua Atalaia`],
  [`Centro`, RGS, `Avenida Dom Pedro I; Rua Pastor Aquilino Sartori; Rua Prefeito Cido Franco`],
  [`Vila Figueiredo`, RGS, `Rua José Maria de Figueiredo`],
  [`Califórnia Paulista`, RGS, `Rua Aida`],
  [`Parque do Governador`, RGS, `Rua Arco-Íris`],
  [`Chácara Esperança`, RGS, `Rua Alasca`],
  [`Vila Arnoud`, RGS, `Rua Prefeito Arthur G. de Souza Jr.`],
  [`Jardim Maria Paula`, RGS, `Rua Aurélio Bracialli`],
  [`Jardim Novo Horizonte`, RGS, `Rua Benedito Cordeiro; Rua Francisco Moraes Ramos`],
  [`Vila Albano`, RGS, `Rua Rio Grande da Serra`],
  [`Vila Santo Antônio`, RGS, `Rua Santo Antônio; Estrada Guilherme Pinto Monteiro`],
  [`Vila Marcos`, RGS, `Rua das Papoulas`],
  [`Vila Verde`, RGS, `Avenida dos Ipês; Rua das Paineiras`],
  [`Chácara Santo Ignácio`, RGS, `Alameda Santo Inácio`],
  [`Parque Pouso Alegre`, RGS, `Estrada Pouso Alegre`],
  [`Fazenda São Joaquim`, RGS, `Estrada Fazenda São Joaquim`],
].flatMap(([district, city, streets]) => streets.split(";").map((street) => [street.trim(), district, city] as [string, string, string]));

/** Nomes de bairro curtos/alternativos que o cliente usa → nome oficial. */
export const DISTRICT_ALIASES: Array<[string, string]> = [
  ["vila conde", "Vila Conde Siciliano"],
  ["conde siciliano", "Vila Conde Siciliano"],
  ["santa tereza", "Jardim Santa Tereza"],
  ["santa teresa", "Jardim Santa Tereza"],
  ["oasis", "Oásis Paulista"],
  ["cassis paulista", "Oásis Paulista"],
  ["governador", "Parque do Governador"],
  ["parque governador", "Parque do Governador"],
  ["novo horizonte", "Jardim Novo Horizonte"],
  ["jardim sao paulo", "Chácara São Paulo"],
  ["santo inacio", "Chácara Santo Ignácio"],
  ["santo ignacio", "Chácara Santo Ignácio"],
  ["nova california", "Vila Nova Califórnia"],
  ["california", "Califórnia Paulista"],
  ["indaia", "Parque Indaiá"],
  ["sete pontes", "Parque Sete Pontes"],
  ["marquesa", "Vila Marquesa"],
  ["ouro fino", "Centro de Ouro Fino Paulista"],
  ["suica", "Suíssa"],
  ["suissa", "Suíssa"],
];
