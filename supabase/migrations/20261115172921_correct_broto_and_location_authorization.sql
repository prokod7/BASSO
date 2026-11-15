-- Broto: two savory flavors or two sweet flavors; mixing sweet and savory is forbidden.
-- Existing order selections and previously recorded authorizations remain untouched.
create or replace function public.validate_broto_item() returns trigger
language plpgsql set search_path='' as $$
declare a text; b text;
begin
  if new.selection->>'size'='broto' and coalesce(new.selection->>'flavorB','')<>'' then
    select category into a from public.pizza_flavors where id=new.selection->>'flavorA';
    select category into b from public.pizza_flavors where id=new.selection->>'flavorB';
    if a is null or b is null then raise exception 'Sabor de pizza indisponível'; end if;
    if (a='sweet')<>(b='sweet') then raise exception 'Na Broto, combine dois sabores salgados ou dois doces. Não misture doce com salgado.'; end if;
    if new.selection->>'flavorA'=new.selection->>'flavorB' then raise exception 'Escolha sabores diferentes'; end if;
  end if;
  return new;
end $$;
revoke all on function public.validate_broto_item() from public,anon,authenticated;
grant execute on function public.validate_broto_item() to service_role;

-- New version preserves immutable historical documents and requests a fresh, explicit authorization.
update public.driver_terms_documents set active=false where active;
insert into public.driver_terms_documents(version,title,body,active) values (
'2026-11-15.2','Autorização de compartilhamento de localização do motoboy',
$terms$1. Finalidade do compartilhamento
Autorizo expressamente o compartilhamento da localização do meu aparelho para acompanhamento das atividades de entrega da La Forneria Basso, nas condições descritas neste documento.

2. Com quem a localização será compartilhada
Com a equipe autorizada da La Forneria Basso, enquanto meu turno estiver ativo e eu mantiver o GPS ativado no sistema. Durante uma entrega em rota, minha localização também poderá ser compartilhada no acompanhamento privado do respectivo cliente, somente enquanto essa entrega estiver em andamento.

3. Ativação e interrupção
O compartilhamento começa quando eu ativar o GPS e conceder a permissão de localização solicitada pelo navegador. Posso pausar o GPS pelo painel. Ao encerrar o turno ou sair da tela do motoboy, o envio de novas posições é interrompido. A conclusão da entrega encerra o acompanhamento público daquele pedido. O sistema não solicita autorização para rastreamento fora do turno nem para finalidades pessoais ou de publicidade.

4. Uso responsável
Utilizarei minha própria conta, manterei a senha protegida e registrarei corretamente a retirada e a entrega. Os dados dos clientes disponibilizados no sistema devem ser utilizados apenas para realizar as entregas e não devem ser copiados ou divulgados para outras finalidades. Dúvidas ou problemas devem ser comunicados à equipe da pizzaria.

5. Confirmação da autorização
Ao informar meu nome e marcar a confirmação, declaro que li este documento e autorizo expressamente o compartilhamento da minha localização nas condições acima. Serão registrados minha conta, o nome informado, a data, o horário e a versão integral da autorização. Uma nova versão exigirá nova confirmação antes de continuar a operação. Se não concordar ou desejar esclarecer o compartilhamento, devo procurar o responsável pela pizzaria antes de utilizar o sistema.$terms$,true);
insert into public.system_migrations(version,name) values(52,'correct_broto_and_location_authorization') on conflict(version) do nothing;
