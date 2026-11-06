import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectOsmPlaces,
  convertOsmElements,
  geoCollectionQuery,
  GeoCollectionError,
} from '../src/places/geo-collect-service.js';

test('GeoAgent só consulta área definida pelo servidor, sem entrada livre no Overpass', () => {
  const query = geoCollectionQuery('prea');
  assert.match(query, /-2\.865,-40\.47,-2\.78,-40\.36/);
  assert.match(query, /out center 1500/);
  assert.throws(() => geoCollectionQuery('nao-existe' as 'prea'),GeoCollectionError);
});

test('GeoAgent converte estabelecimentos e rejeita registros fora do perímetro', () => {
  const source = { elements: [
    {type:'node' as const,id:123,lat:-2.82017,lon:-40.41467,
      tags:{name:'Restaurante Exemplo',amenity:'restaurant','addr:street':'Rua do Céu'}},
    {type:'way' as const,id:456,center:{lat:-2.823,lon:-40.416},
      tags:{name:'Pousada Exemplo',tourism:'guest_house'}},
    {type:'node' as const,id:789,lat:-3.7319,lon:-38.52,
      tags:{name:'Fora da área',amenity:'bar'}},
  ]};
  const result = convertOsmElements(source,'prea');
  assert.equal(result.places.length,2);
  assert.equal(result.places[0]?.source,'osm');
  assert.equal(result.places[0]?.sourceId,'node/123');
  assert.match(result.places[0]?.address??'',/Rua do Céu/);
  assert.equal(result.places[1]?.sourceId,'way/456');
  assert.equal(result.places[1]?.category,'tourism:guest_house');
});

test('GeoAgent coleta sob solicitação, limita fonte fixa e trata indisponibilidade', async () => {
  let invoked=0;
  const fetcher = (async (url: string | URL | Request,options?:RequestInit) => {
    invoked++;
    assert.equal(String(url),'https://overpass-api.de/api/interpreter');
    assert.equal(options?.method,'POST');
    const params=new URLSearchParams(String(options?.body));
    assert.match(params.get('data')??'',/restaurant/);
    return new Response(JSON.stringify({elements:[
      {type:'node',id:123,lat:-2.82017,lon:-40.41467,
        tags:{name:'Farmácia Exemplo',amenity:'pharmacy'}},
    ]}),{status:200,headers:{'content-type':'application/json'}});
  }) as typeof fetch;
  const result=await collectOsmPlaces({region:'prea',fetcher});
  assert.equal(invoked,1);
  assert.equal(result.places[0]?.category,'amenity:pharmacy');
  assert.equal(result.truncated,false);

  const denied=(async()=>new Response('',{status:429})) as typeof fetch;
  await assert.rejects(()=>collectOsmPlaces({region:'prea',fetcher:denied}),
    (error:unknown)=>error instanceof GeoCollectionError && error.status===429);
});
