function formatTimeOLD(hora: number): string {
  const str = hora.toString().padStart(6, '0');
  const hours = str.substring(0, 2);
  const minutes = str.substring(2, 4);
  return `${hours}:${minutes}`;
}

// Simular lo que pasa ahora
const mysqlTime1 = '08:00:00'; // TIME de MySQL
const mysqlTime2 = '08:30:00';
const mysqlTime3 = '15:40:00';

console.log('Entrada MySQL:', mysqlTime1);
console.log('Como número:', Number(mysqlTime1));
console.log('FormatTime:', formatTimeOLD(mysqlTime1 as any));
console.log('');

console.log('Entrada MySQL:', mysqlTime2);
console.log('Como número:', Number(mysqlTime2));
console.log('FormatTime:', formatTimeOLD(mysqlTime2 as any));
console.log('');

console.log('Entrada MySQL:', mysqlTime3);
console.log('Como número:', Number(mysqlTime3));
console.log('FormatTime:', formatTimeOLD(mysqlTime3 as any));
