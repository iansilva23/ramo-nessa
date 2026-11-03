import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
class BoardingCodeDialog extends StatefulWidget {
 const BoardingCodeDialog({super.key,required this.delivery,required this.remainingAttempts});
 final bool delivery;final int remainingAttempts;
 @override State<BoardingCodeDialog> createState()=>_BoardingCodeDialogState();
}
class _BoardingCodeDialogState extends State<BoardingCodeDialog>{
 final _controller=TextEditingController();
 @override void dispose(){_controller.dispose();super.dispose();}
 @override Widget build(BuildContext context)=>AlertDialog(
  title:Text(widget.delivery?'Código de coleta':'Código de embarque'),
  content:Column(mainAxisSize:MainAxisSize.min,children:[
   Text('Peça os três números no encontro. Restam ${widget.remainingAttempts} tentativas.'),
   TextField(controller:_controller,autofocus:true,keyboardType:TextInputType.number,maxLength:3,
    inputFormatters:[FilteringTextInputFormatter.digitsOnly,LengthLimitingTextInputFormatter(3)],decoration:const InputDecoration(labelText:'Código de 3 dígitos'),onChanged:(_)=>setState((){})),
  ]),actions:[TextButton(onPressed:()=>Navigator.pop(context),child:const Text('Voltar')),
   FilledButton(onPressed:RegExp(r'^\d{3}$').hasMatch(_controller.text)?()=>Navigator.pop(context,_controller.text):null,child:const Text('Validar e iniciar'))]);
}
