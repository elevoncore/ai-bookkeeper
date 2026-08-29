import dns from 'dns';

dns.lookup('yfxncnxbqjcmqiztfhfn.supabase.co', (err, address, family) => {
  console.log('address:', address);
  dns.reverse(address, (err, hostnames) => {
    console.log('reverse hostnames:', hostnames);
  });
});
