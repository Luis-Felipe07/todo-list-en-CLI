export type NonEmptyString = string & { readonly __brand: 'NonEmptyString'};

export function NonEmptyString(val: string): NonEmptyString{
        if(!val || val.trim().length === 0){
            throw new Error('El valor no puede ser vacio')
        }

        return val as NonEmptyString;
}